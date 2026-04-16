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
    <div class="page-wrapper container fade-in">
      <div class="page-header">
        <div>
          <h1>Elections</h1>
          <p class="text-muted">Browse and participate in academic council elections</p>
        </div>
        @if (auth.isAdmin()) {
          <a routerLink="/elections/create" class="btn btn-primary">+ Create Election</a>
        }
      </div>

      <!-- Filter tabs -->
      <div class="filter-tabs">
        @for (tab of tabs; track tab.value) {
          <button class="tab-btn" [class.active]="activeTab() === tab.value"
                  (click)="setTab(tab.value)">
            {{ tab.label }}
          </button>
        }
      </div>

      @if (loading()) {
        <div class="loading-grid">
          @for (i of [1,2,3,4,5,6]; track i) { <div class="skeleton-card"></div> }
        </div>
      } @else if (filtered().length === 0) {
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <h3>No elections found</h3>
          <p>No {{ activeTab() }} elections at the moment.</p>
        </div>
      } @else {
        <div class="elections-grid">
          @for (e of filtered(); track e.id) {
            <div class="election-card card">
              <div class="card-top">
                <span class="badge" [class]="'badge-' + e.status">{{ e.status }}</span>
                <span class="text-xs text-muted">{{ formatDate(e.start_time) }}</span>
              </div>
              <h3 class="truncate">{{ e.title }}</h3>
              <p class="text-muted text-sm" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                {{ e.description ?? 'No description provided.' }}
              </p>
              <div class="card-footer">
                <a [routerLink]="['/elections', e.id]" class="btn btn-ghost btn-sm">Details</a>
                @if (e.status === 'active') {
                  <a [routerLink]="['/elections', e.id, 'vote']" class="btn btn-primary btn-sm">Vote Now</a>
                }
                @if (e.status === 'completed' || e.status === 'active') {
                  <a [routerLink]="['/elections', e.id, 'results']" class="btn btn-secondary btn-sm">Results</a>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page-wrapper { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; flex-wrap: wrap; gap: 1rem; }
    .page-header h1 { font-size: 2rem; margin-bottom: 0.3rem; }
    .filter-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.75rem; flex-wrap: wrap; }
    .tab-btn { padding: 0.5rem 1.1rem; border-radius: 8px; border: 1px solid var(--clr-border); background: var(--clr-surface); color: var(--clr-text-muted); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: inherit; }
    .tab-btn:hover { border-color: var(--clr-primary); color: var(--clr-primary); }
    .tab-btn.active { background: rgba(108,99,255,0.15); border-color: var(--clr-primary); color: var(--clr-primary); }
    .elections-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px,1fr)); gap: 1.25rem; }
    .election-card { display: flex; flex-direction: column; gap: 0.75rem; }
    .card-top { display: flex; justify-content: space-between; align-items: center; }
    .card-footer { display: flex; gap: 0.5rem; margin-top: auto; padding-top: 0.75rem; }
    .loading-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px,1fr)); gap: 1.25rem; }
    .skeleton-card { height: 200px; background: var(--clr-surface); border: 1px solid var(--clr-border); border-radius: 16px; animation: sk 1.5s ease-in-out infinite; }
    @keyframes sk { 0%,100%{opacity:1;}50%{opacity:0.4;} }
    .empty-state { text-align: center; padding: 4rem 2rem; background: var(--clr-surface); border: 1px dashed var(--clr-border); border-radius: 16px; }
    .empty-icon { font-size: 3rem; margin-bottom: 1rem; display: block; }
  `],
})
export class ElectionsListComponent implements OnInit {
  auth    = inject(AuthService);
  elecSvc = inject(ElectionService);

  elections  = signal<Election[]>([]);
  loading    = signal(true);
  activeTab  = signal<string>('all');

  tabs = [
    { label: 'All',       value: 'all' },
    { label: '🟢 Active',   value: 'active' },
    { label: '📅 Upcoming', value: 'upcoming' },
    { label: '✅ Completed',value: 'completed' },
    { label: '📝 Draft',    value: 'draft' },
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
