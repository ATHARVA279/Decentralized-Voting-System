import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Election, ElectionService, ElectionStatus } from '../../../core/services/election.service';

@Component({
  selector: 'app-admin-elections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-shell">
      <div class="container page-stack fade-in">
        <section class="card section-head">
          <div>
            <div class="eyebrow">Admin</div>
            <h1>Election Controls</h1>
            <p class="text-muted">Adjust status with guardrails, remove upcoming elections, and purge election data when needed.</p>
          </div>
        </section>

        @if (error()) {
          <div class="card callout callout-danger">{{ error() }}</div>
        }
        @if (success()) {
          <div class="card callout callout-success">{{ success() }}</div>
        }

        <section class="card list-wrap">
          <div class="list-meta">
            <strong>{{ elections().length }}</strong> elections loaded
            <button class="btn btn-secondary btn-sm" (click)="loadElections()" [disabled]="loading()">
              {{ loading() ? 'Refreshing...' : 'Refresh' }}
            </button>
          </div>

          @if (loading()) {
            <div class="text-muted">Loading elections...</div>
          } @else if (elections().length === 0) {
            <div class="text-muted">No elections found.</div>
          } @else {
            <div class="grid">
              @for (e of elections(); track e.id) {
                <article class="card election-card">
                  <div class="top-row">
                    <span class="badge" [class]="'badge badge-' + e.status">{{ e.status }}</span>
                    <span class="text-xs text-muted">{{ formatDate(e.start_time) }} -> {{ formatDate(e.end_time) }}</span>
                  </div>

                  <h3>{{ e.title }}</h3>
                  <p class="text-muted text-sm">{{ e.description || 'No description provided.' }}</p>

                  <div class="status-row">
                    <select class="form-control" [(ngModel)]="statusDraft[e.id]">
                      @for (s of allowedStatuses; track s) {
                        <option [value]="s">{{ s }}</option>
                      }
                    </select>
                    <button class="btn btn-primary btn-sm" [disabled]="pendingStatusId() === e.id" (click)="saveStatus(e)">
                      {{ pendingStatusId() === e.id ? 'Saving...' : 'Save status' }}
                    </button>
                  </div>

                  <div class="actions">
                    <button class="btn btn-ghost btn-sm" [disabled]="pendingDeleteId() === e.id" (click)="deleteElection(e)">
                      {{ pendingDeleteId() === e.id ? 'Deleting...' : 'Delete election' }}
                    </button>
                  </div>
                </article>
              }
            </div>
          }
        </section>

        <section class="card purge-panel">
          <h3>Danger Zone: Purge Election Data</h3>
          <p class="text-muted text-sm">This endpoint deletes election records and related votes. Type DELETE_ALL_ELECTIONS to continue.</p>

          <div class="purge-controls">
            <input class="form-control" [(ngModel)]="confirmText" placeholder="Type DELETE_ALL_ELECTIONS" />
            <label class="check-row">
              <input type="checkbox" [(ngModel)]="includeCompleted" />
              Include completed elections
            </label>
            <button class="btn btn-danger" [disabled]="purging()" (click)="purge()">
              {{ purging() ? 'Purging...' : 'Run purge' }}
            </button>
          </div>
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

    .section-head,
    .list-wrap,
    .purge-panel {
      padding: 1.2rem;
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

    .list-meta {
      display: flex;
      justify-content: space-between;
      gap: 0.7rem;
      align-items: center;
      margin-bottom: 0.9rem;
      color: var(--text-muted);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 0.9rem;
    }

    .election-card {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
    }

    .top-row,
    .status-row,
    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    .status-row .form-control {
      width: 180px;
      min-height: 2.3rem;
    }

    .purge-panel {
      border: 1px solid rgba(239, 68, 68, 0.35);
      background: rgba(127, 29, 29, 0.2);
    }

    .purge-controls {
      display: flex;
      flex-direction: column;
      gap: 0.7rem;
      max-width: 460px;
      margin-top: 0.8rem;
    }

    .check-row {
      display: inline-flex;
      gap: 0.45rem;
      align-items: center;
      color: var(--text-base);
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
export class AdminElectionsComponent {
  private electionService = inject(ElectionService);

  readonly elections = signal<Election[]>([]);
  readonly loading = signal(false);
  readonly pendingStatusId = signal<string | null>(null);
  readonly pendingDeleteId = signal<string | null>(null);
  readonly purging = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  allowedStatuses: ElectionStatus[] = ['upcoming', 'active', 'completed', 'cancelled'];
  statusDraft: Record<string, ElectionStatus> = {};

  confirmText = '';
  includeCompleted = false;

  constructor() {
    this.loadElections();
  }

  loadElections(): void {
    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    this.electionService.list(undefined, 200, 0).subscribe({
      next: ({ data }) => {
        this.elections.set(data);
        this.statusDraft = Object.fromEntries(data.map((e) => [e.id, e.status]));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error || 'Failed to load elections');
        this.loading.set(false);
      },
    });
  }

  saveStatus(election: Election): void {
    const selected = this.statusDraft[election.id];
    if (!selected || selected === election.status) {
      return;
    }

    this.pendingStatusId.set(election.id);
    this.error.set('');
    this.success.set('');

    this.electionService.adminUpdateStatus(election.id, selected).subscribe({
      next: (updated) => {
        this.elections.set(this.elections().map((e) => (e.id === updated.id ? updated : e)));
        this.statusDraft[updated.id] = updated.status;
        this.pendingStatusId.set(null);
        this.success.set(`Updated status for ${updated.title} to ${updated.status}.`);
      },
      error: (err) => {
        this.pendingStatusId.set(null);
        this.error.set(err?.error?.error || 'Failed to update election status');
      },
    });
  }

  deleteElection(election: Election): void {
    const ok = confirm(`Delete election "${election.title}"?`);
    if (!ok) return;

    this.pendingDeleteId.set(election.id);
    this.error.set('');
    this.success.set('');

    this.electionService.delete(election.id).subscribe({
      next: () => {
        this.elections.set(this.elections().filter((e) => e.id !== election.id));
        this.pendingDeleteId.set(null);
        this.success.set(`Deleted ${election.title}.`);
      },
      error: (err) => {
        this.pendingDeleteId.set(null);
        this.error.set(err?.error?.error || 'Failed to delete election');
      },
    });
  }

  purge(): void {
    this.error.set('');
    this.success.set('');

    if (this.confirmText.trim() !== 'DELETE_ALL_ELECTIONS') {
      this.error.set("Type DELETE_ALL_ELECTIONS exactly to purge data.");
      return;
    }

    this.purging.set(true);
    this.electionService.adminPurge(this.confirmText.trim(), this.includeCompleted).subscribe({
      next: (res) => {
        this.purging.set(false);
        this.confirmText = '';
        this.success.set(`Purge completed: ${res.deleted_elections} elections and ${res.deleted_votes} votes deleted.`);
        this.loadElections();
      },
      error: (err) => {
        this.purging.set(false);
        this.error.set(err?.error?.error || 'Purge failed');
      },
    });
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
