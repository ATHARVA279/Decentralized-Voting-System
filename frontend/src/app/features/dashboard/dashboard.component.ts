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
    <div class="page-wrapper container">
      <!-- Hero greeting -->
      <div class="hero fade-in">
        <div>
          <h1>Good {{ timeGreeting() }}, <span class="gradient-text">{{ (user()?.full_name || 'User').split(' ')[0] }}</span> 👋</h1>
          <p class="text-muted">{{ user()?.role === 'admin' ? 'Manage elections and oversee voting activity' : 'Cast your vote and follow live results' }}</p>
        </div>
        @if (user()?.role === 'admin') {
          <a routerLink="/elections/create" class="btn btn-primary">+ New Election</a>
        }
      </div>

      <!-- Stats row -->
      <div class="stats-grid fade-in">
        <div class="stat-card">
          <span class="stat-value">{{ stats().active }}</span>
          <span class="stat-label">Active Elections</span>
          <div class="stat-icon">🗳️</div>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ stats().upcoming }}</span>
          <span class="stat-label">Upcoming</span>
          <div class="stat-icon">📅</div>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ stats().completed }}</span>
          <span class="stat-label">Completed</span>
          <div class="stat-icon">✅</div>
        </div>
        <div class="stat-card">
          <span class="stat-value">{{ stats().total }}</span>
          <span class="stat-label">Total Elections</span>
          <div class="stat-icon">📊</div>
        </div>
      </div>

      <!-- Active elections -->
      <section class="section fade-in">
        <div class="section-header">
          <h2>Active Elections</h2>
          <a routerLink="/elections" class="btn btn-ghost btn-sm">View all →</a>
        </div>

        @if (loadingElections()) {
          <div class="loading-grid">
            @for (i of [1,2,3]; track i) {
              <div class="skeleton-card"></div>
            }
          </div>
        } @else if (activeElections().length === 0) {
          <div class="empty-state">
            <span class="empty-icon">🗳️</span>
            <h3>No active elections</h3>
            <p>Elections will appear here when they go live.</p>
          </div>
        } @else {
          <div class="elections-grid">
            @for (election of activeElections(); track election.id) {
              <div class="election-card card">
                <div class="card-top">
                  <span class="badge badge-active">● Live</span>
                  <span class="time-left text-xs text-muted">{{ formatTimeLeft(election.end_time) }}</span>
                </div>
                <h3>{{ election.title }}</h3>
                <p class="text-muted text-sm">{{ election.description ?? 'Cast your vote before the election closes.' }}</p>
                <div class="card-actions">
                  <a [routerLink]="['/elections', election.id, 'vote']" class="btn btn-primary btn-sm">Cast Vote</a>
                  <a [routerLink]="['/elections', election.id, 'results']" class="btn btn-ghost btn-sm">Live Results</a>
                </div>
              </div>
            }
          </div>
        }
      </section>

      <!-- Upcoming elections preview -->
      @if (upcomingElections().length > 0) {
        <section class="section fade-in">
          <div class="section-header">
            <h2>Upcoming</h2>
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
  `,
  styles: [`
    .page-wrapper { padding: 2rem 1.5rem; max-width: 1200px; margin: 0 auto; }
    .hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 2.5rem; flex-wrap: wrap; }
    .hero h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .gradient-text { background: linear-gradient(135deg, var(--clr-primary), var(--clr-secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .stats-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 1rem; margin-bottom: 2.5rem; }
    .stat-card { position: relative; }
    .stat-icon { position: absolute; top: 1rem; right: 1rem; font-size: 1.5rem; opacity: 0.3; }
    .section { margin-bottom: 2.5rem; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
    .section-header h2 { font-size: 1.25rem; }
    .elections-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px,1fr)); gap: 1.25rem; }
    .election-card { display: flex; flex-direction: column; gap: 0.75rem; }
    .card-top { display: flex; align-items: center; justify-content: space-between; }
    .card-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
    .time-left { font-size: 0.75rem; }
    .loading-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px,1fr)); gap: 1.25rem; }
    .skeleton-card { height: 180px; background: var(--clr-surface); border: 1px solid var(--clr-border); border-radius: 16px; animation: pulse-skeleton 1.5s ease-in-out infinite; }
    @keyframes pulse-skeleton { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .empty-state { text-align: center; padding: 3rem; background: var(--clr-surface); border: 1px dashed var(--clr-border); border-radius: 16px; }
    .empty-icon { font-size: 3rem; display: block; margin-bottom: 1rem; }
    .upcoming-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .upcoming-item { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; background: var(--clr-surface); border: 1px solid var(--clr-border); border-radius: 10px; text-decoration: none; color: var(--clr-text); transition: all 0.2s; }
    .upcoming-item:hover { border-color: var(--clr-primary); background: var(--clr-surface-2); }
    .upcoming-title { font-weight: 600; font-size: 0.95rem; }
    @media (max-width: 768px) { .stats-grid { grid-template-columns: repeat(2,1fr); } .hero { flex-direction: column; } }
    @media (max-width: 480px) { .stats-grid { grid-template-columns: 1fr 1fr; } }
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
