import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }     from '@angular/common';
import { RouterLink }       from '@angular/router';
import { AuthService }      from '../../core/services/auth.service';
import { ElectionService, Election } from '../../core/services/election.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-shell">
      <div class="page-wrapper container">
        <section class="hero card fade-in">
          <div class="hero-copy">
            <div class="eyebrow">Overview</div>
            <h1>Good {{ timeGreeting() }}, {{ (user()?.full_name || 'User').split(' ')[0] }}.</h1>
            <p class="text-muted">{{ user()?.role === 'admin' ? 'Manage elections, monitor engagement, and keep voting operations clear and reliable.' : 'Review active elections, cast ballots, and keep track of what is happening across campus.' }}</p>
          </div>
          <div class="hero-actions">
            <a routerLink="/elections" class="btn btn-secondary">Browse elections</a>
            @if (user()?.role === 'admin') {
              <a routerLink="/elections/create" class="btn btn-primary">Create election</a>
            }
          </div>
        </section>

        <div class="stats-grid fade-in">
          <div class="stat-card">
            <span class="stat-value">{{ stats().active }}</span>
            <span class="stat-label">Active Elections</span>
            <div class="stat-icon">Live now</div>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ stats().upcoming }}</span>
            <span class="stat-label">Upcoming</span>
            <div class="stat-icon">Planning</div>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ stats().completed }}</span>
            <span class="stat-label">Completed</span>
            <div class="stat-icon">Archived</div>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ stats().total }}</span>
            <span class="stat-label">Total Elections</span>
            <div class="stat-icon">All time</div>
          </div>
        </div>

        <section class="section fade-in">
          <div class="section-header">
            <div>
              <h2>Active Elections</h2>
              <p class="text-muted">Everything open for participation right now.</p>
            </div>
            <a routerLink="/elections" class="btn btn-ghost btn-sm">View all</a>
          </div>

          @if (loadingElections()) {
            <div class="loading-grid">
              @for (i of [1,2,3]; track i) {
                <div class="skeleton-card"></div>
              }
            </div>
          } @else if (activeElections().length === 0) {
            <div class="empty-state">
              <i class="ri-inbox-archive-line empty-icon"></i>
              <h3>No active elections</h3>
              <p>Elections will appear here when they go live.</p>
            </div>
          } @else {
            <div class="elections-grid">
              @for (election of activeElections(); track election.id) {
                <div class="election-card card">
                  <div class="card-top">
                    <span class="badge badge-active">Live</span>
                    <span class="time-left text-xs text-muted">{{ formatTimeLeft(election.end_time) }}</span>
                  </div>
                  <h3>{{ election.title }}</h3>
                  <p class="text-muted text-sm">{{ election.description ?? 'Cast your vote before the election closes.' }}</p>
                  <div class="card-actions">
                    <a [routerLink]="['/elections', election.id, 'vote']" class="btn btn-primary btn-sm">Cast vote</a>
                    <a [routerLink]="['/elections', election.id, 'results']" class="btn btn-ghost btn-sm">Live results</a>
                  </div>
                </div>
              }
            </div>
          }
        </section>

        @if (upcomingElections().length > 0) {
          <section class="section fade-in">
            <div class="section-header">
              <div>
                <h2>Upcoming</h2>
                <p class="text-muted">A quick look at what is scheduled next.</p>
              </div>
            </div>
            <div class="upcoming-list">
              @for (election of upcomingElections(); track election.id) {
                <a [routerLink]="['/elections', election.id]" class="upcoming-item">
                  <div>
                    <div class="upcoming-title">{{ election.title }}</div>
                    <div class="text-xs text-muted">Starts {{ formatDate(election.start_time) }}</div>
                  </div>
                  <span class="badge badge-upcoming">Upcoming</span>
                </a>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
  styles: [`
    .page-wrapper {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }

    .hero {
      display: flex;
      justify-content: space-between;
      gap: 1.5rem;
      padding: 2rem;
    }

    .hero-copy {
      max-width: 42rem;
    }

    .hero-copy h1 {
      margin-bottom: 0.75rem;
    }

    .hero-actions {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .eyebrow {
      display: inline-flex;
      margin-bottom: 1rem;
      padding: 0.35rem 0.7rem;
      border-radius: 999px;
      background: var(--bg-accent-soft);
      color: #82e8f3;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1rem;
    }

    .stat-icon {
      position: absolute;
      top: 1.1rem;
      right: 1.2rem;
      color: var(--text-faint);
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 1rem;
    }

    .elections-grid,
    .loading-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem;
    }

    .election-card {
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
      padding: 1.4rem;
    }

    .card-top,
    .card-actions,
    .upcoming-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .card-actions {
      margin-top: auto;
      flex-wrap: wrap;
    }

    .upcoming-list {
      display: grid;
      gap: 0.85rem;
    }

    .upcoming-item {
      padding: 1rem 1.2rem;
      background: rgba(16, 27, 34, 0.82);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xs);
      transition: transform var(--transition-fast), box-shadow var(--transition-base), border-color var(--transition-base);
    }

    .upcoming-item:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-sm);
      border-color: var(--border-strong);
    }

    .upcoming-title {
      color: var(--text-strong);
      font-weight: 700;
      margin-bottom: 0.2rem;
    }

    @media (max-width: 900px) {
      .stats-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .hero {
        flex-direction: column;
      }
    }

    @media (max-width: 640px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class DashboardComponent implements OnInit {
  private auth     = inject(AuthService);
  private elecSvc  = inject(ElectionService);

  user              = this.auth.user;
  loadingElections  = signal(true);
  activeElections   = signal<Election[]>([]);
  upcomingElections = signal<Election[]>([]);
  stats = signal({ active: 0, upcoming: 0, completed: 0, total: 0 });

  ngOnInit() {
    this.elecSvc.list(undefined, 100).subscribe({
      next: ({ data }) => {
        this.activeElections.set(data.filter(e => e.status === 'active'));
        this.upcomingElections.set(data.filter(e => e.status === 'upcoming').slice(0, 5));
        this.stats.set({
          active:    data.filter(e => e.status === 'active').length,
          upcoming:  data.filter(e => e.status === 'upcoming').length,
          completed: data.filter(e => e.status === 'completed').length,
          total:     data.length,
        });
        this.loadingElections.set(false);
      },
      error: () => this.loadingElections.set(false),
    });
  }

  timeGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }

  formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatTimeLeft(end: string): string {
    const ms   = new Date(end).getTime() - Date.now();
    if (ms <= 0) return 'Ended';
    const h    = Math.floor(ms / 3_600_000);
    const m    = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
  }
}
