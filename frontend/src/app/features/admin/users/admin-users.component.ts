import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, AdminUser } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-shell">
      <div class="container page-stack fade-in">
        <section class="card section-head">
          <div>
            <div class="eyebrow">Admin</div>
            <h1>User Directory</h1>
            <p class="text-muted">Search users, review account state, and activate or deactivate access.</p>
          </div>
        </section>

        <section class="card filters">
          <div class="form-group grow">
            <label class="form-label">Search</label>
            <input class="form-control" [(ngModel)]="query" placeholder="Name, email, or student ID" />
          </div>

          <div class="form-group compact">
            <label class="form-label">Role</label>
            <select class="form-control" [(ngModel)]="roleFilter">
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="voter">Voter</option>
            </select>
          </div>

          <div class="form-group compact">
            <label class="form-label">Status</label>
            <select class="form-control" [(ngModel)]="statusFilter">
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <button class="btn btn-primary" (click)="loadUsers()" [disabled]="loading()">Apply</button>
        </section>

        @if (error()) {
          <div class="card callout callout-danger">{{ error() }}</div>
        }
        @if (success()) {
          <div class="card callout callout-success">{{ success() }}</div>
        }

        <section class="card table-wrap">
          <div class="table-meta">
            <strong>{{ total() }}</strong> users found
          </div>

          @if (loading()) {
            <div class="text-muted">Loading users...</div>
          } @else if (users().length === 0) {
            <div class="text-muted">No users match current filters.</div>
          } @else {
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  @for (u of users(); track u.id) {
                    <tr>
                      <td>
                        <div class="name">{{ u.full_name }}</div>
                        <div class="text-xs text-muted">{{ u.student_id || 'No student ID' }}</div>
                      </td>
                      <td>{{ u.email }}</td>
                      <td><span class="badge" [class]="'badge badge-' + u.role">{{ u.role }}</span></td>
                      <td>
                        <span class="badge" [class]="u.is_active ? 'badge badge-active' : 'badge badge-cancelled'">
                          {{ u.is_active ? 'active' : 'inactive' }}
                        </span>
                      </td>
                      <td>{{ formatDate(u.created_at) }}</td>
                      <td>
                        <button
                          class="btn btn-sm"
                          [class]="u.is_active ? 'btn-ghost' : 'btn-primary'"
                          [disabled]="pendingUserId() === u.id"
                          (click)="toggleStatus(u)">
                          {{ pendingUserId() === u.id ? 'Saving...' : (u.is_active ? 'Deactivate' : 'Activate') }}
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    .page-stack {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .section-head {
      padding: 1.4rem;
    }

    .eyebrow {
      display: inline-flex;
      margin-bottom: 0.7rem;
      padding: 0.35rem 0.7rem;
      border-radius: 999px;
      background: var(--bg-accent-soft);
      color: #82e8f3;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .filters {
      display: flex;
      gap: 0.8rem;
      align-items: end;
      padding: 1rem;
      flex-wrap: wrap;
    }

    .grow {
      flex: 1 1 260px;
    }

    .compact {
      width: 180px;
    }

    .table-wrap {
      padding: 1rem;
      overflow: hidden;
    }

    .table-meta {
      margin-bottom: 0.7rem;
      color: var(--text-muted);
    }

    .table-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 820px;
    }

    th,
    td {
      text-align: left;
      border-bottom: 1px solid var(--border-soft);
      padding: 0.7rem 0.5rem;
      vertical-align: middle;
    }

    th {
      color: var(--text-muted);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .name {
      color: var(--text-strong);
      font-weight: 600;
    }

    .callout {
      padding: 0.8rem 1rem;
    }

    .callout-danger {
      border-color: rgba(239, 68, 68, 0.35);
      background: rgba(127, 29, 29, 0.25);
      color: #fecaca;
    }

    .callout-success {
      border-color: rgba(34, 197, 94, 0.35);
      background: rgba(20, 83, 45, 0.25);
      color: #bbf7d0;
    }
  `],
})
export class AdminUsersComponent {
  private auth = inject(AuthService);

  readonly users = signal<AdminUser[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly pendingUserId = signal<string | null>(null);

  query = '';
  roleFilter: 'all' | 'admin' | 'voter' = 'all';
  statusFilter: 'all' | 'active' | 'inactive' = 'all';

  constructor() {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    const isActive = this.statusFilter === 'all'
      ? undefined
      : this.statusFilter === 'active';

    this.auth.adminListUsers({
      q: this.query,
      role: this.roleFilter === 'all' ? undefined : this.roleFilter,
      is_active: isActive,
      limit: 100,
      offset: 0,
    }).subscribe({
      next: (res) => {
        this.users.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.error || 'Failed to load users');
      },
    });
  }

  toggleStatus(user: AdminUser): void {
    this.pendingUserId.set(user.id);
    this.error.set('');
    this.success.set('');

    this.auth.adminUpdateUserStatus(user.id, !user.is_active).subscribe({
      next: (updated) => {
        this.users.set(this.users().map((u) => (u.id === updated.id ? updated : u)));
        this.pendingUserId.set(null);
        this.success.set(`Updated ${updated.full_name} to ${updated.is_active ? 'active' : 'inactive'}.`);
      },
      error: (err) => {
        this.pendingUserId.set(null);
        this.error.set(err?.error?.error || 'Failed to update user status');
      },
    });
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
