import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink }   from '@angular/router';
import { FormsModule }  from '@angular/forms';
import { ElectionService, Election } from '../../../core/services/election.service';
import { AuthService }  from '../../../core/services/auth.service';

@Component({
  selector: 'app-elections-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-shell">
      <div class="page-wrapper container fade-in">
        <section class="page-header card">
          <div class="header-copy">
            <div class="eyebrow">Election center</div>
            <h1>Elections</h1>
            <p class="text-muted">Browse, filter, and act on each election from one calm, readable workspace.</p>
          </div>
          @if (auth.isAdmin()) {
            <a routerLink="/elections/create" class="btn btn-primary">Create election</a>
          }
        </section>

        <section class="filters card">
          <div class="filters-copy">
            <h3>Filter by status</h3>
            <p class="text-muted text-sm">Switch views to focus on what is live, scheduled, or completed.</p>
          </div>
          <div class="filter-tabs">
            @for (tab of tabs; track tab.value) {
              <button class="tab-btn" [class.active]="activeTab() === tab.value"
                      (click)="setTab(tab.value)">
                @if (tab.icon) { <i [class]="tab.icon"></i> }
                {{ tab.label }}
              </button>
            }
          </div>
        </section>

        @if (loading()) {
          <div class="loading-grid">
            @for (i of [1,2,3,4,5,6]; track i) { <div class="skeleton-card"></div> }
          </div>
        } @else if (filtered().length === 0) {
          <div class="empty-state">
            <i class="ri-file-list-3-line empty-icon"></i>
            <h3>No elections found</h3>
            <p>No {{ activeTab() }} elections at the moment.</p>
          </div>
        } @else {
          <div class="elections-grid">
            @for (e of filtered(); track e.id) {
              <article class="election-card card">
                <div class="card-top">
                  <span class="badge" [class]="'badge badge-' + e.status">{{ e.status }}</span>
                  <span class="text-xs text-muted">{{ formatDate(e.start_time) }}</span>
                </div>
                <div class="card-body">
                  <h3 class="title">{{ e.title }}</h3>
                  <p class="text-muted text-sm description">
                    {{ e.description ?? 'No description provided.' }}
                  </p>
                </div>
                <div class="card-footer">
                  <a [routerLink]="['/elections', e.id]" class="btn btn-ghost btn-sm">Details</a>
                  <div class="footer-actions">
                    @if (e.status === 'completed' || e.status === 'active') {
                      <a [routerLink]="['/elections', e.id, 'results']" class="btn btn-secondary btn-sm">Results</a>
                    }
                    @if (e.status === 'active') {
                      <a [routerLink]="['/elections', e.id, 'vote']" class="btn btn-primary btn-sm">Vote now</a>
                    }
                  </div>
                </div>
              </article>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page-wrapper {
      display: flex;
      flex-direction: column;
      gap: 1.4rem;
    }

    .page-header,
    .filters {
      display: flex;
      justify-content: space-between;
      gap: 1.2rem;
      padding: 1.6rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .header-copy,
    .filters-copy {
      max-width: 36rem;
    }

    .eyebrow {
      display: inline-flex;
      margin-bottom: 0.8rem;
      padding: 0.35rem 0.7rem;
      border-radius: 999px;
      background: var(--bg-accent-soft);
      color: #82e8f3;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .filter-tabs {
      display: flex;
      gap: 0.6rem;
      flex-wrap: wrap;
    }

    .tab-btn {
      padding: 0.72rem 1rem;
      border-radius: 999px;
      border: 1px solid var(--border-soft);
      background: rgba(16, 27, 34, 0.9);
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      transition: background-color var(--transition-base), border-color var(--transition-base), color var(--transition-base);
    }

    .tab-btn:hover,
    .tab-btn.active {
      color: var(--text-strong);
      border-color: rgba(38, 198, 218, 0.28);
      background: rgba(38, 198, 218, 0.12);
    }

    .elections-grid,
    .loading-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.25rem;
    }

    .election-card {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      padding: 1.5rem;
      background: linear-gradient(180deg, rgba(17, 28, 36, 0.96) 0%, rgba(13, 22, 29, 0.98) 100%);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 0.25rem;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-top: auto;
      padding-top: 1rem;
      border-top: 1px solid var(--border-soft);
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex-grow: 1;
    }

    .title {
      color: var(--text-strong);
      font-weight: 600;
      font-size: 1.125rem;
      letter-spacing: -0.01em;
    }

    .description {
      display: -webkit-box;
      overflow: hidden;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      line-height: 1.5;
    }

    .footer-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  `],
})
export class ElectionsListComponent implements OnInit {
  auth    = inject(AuthService);
  elecSvc = inject(ElectionService);

  elections  = signal<Election[]>([]);
  loading    = signal(true);
  activeTab  = signal<string>('all');

  tabs = [
    { label: 'All',       value: 'all',       icon: 'ri-layout-grid-line' },
    { label: 'Active',    value: 'active',    icon: 'ri-record-circle-line' },
    { label: 'Upcoming',  value: 'upcoming',  icon: 'ri-calendar-event-line' },
    { label: 'Completed', value: 'completed', icon: 'ri-checkbox-circle-line' },
  ];

  filtered = () => {
    const tab = this.activeTab();
    const all = this.elections();
    return tab === 'all' ? all : all.filter(e => e.status === tab);
  };

  ngOnInit() {
    this.elecSvc.list(undefined, 100).subscribe({
      next: ({ data }) => { this.elections.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  setTab(val: string) { this.activeTab.set(val); }

  formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
