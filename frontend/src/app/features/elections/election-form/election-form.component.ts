import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }   from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule }    from '@angular/forms';
import { ElectionService, CreateElectionDto } from '../../../core/services/election.service';
import { AuthService, User }    from '../../../core/services/auth.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-election-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-wrapper container fade-in">
      <div class="page-header">
        <a routerLink="/elections" class="btn btn-ghost btn-sm">← Back</a>
        <h1>Create New Election</h1>
      </div>

      <div class="form-card card">
        <form (ngSubmit)="onSubmit()" #f="ngForm">
          <div class="form-section">
            <h3>Basic Information</h3>
            <div class="form-group">
              <label class="form-label">Election Title *</label>
              <input class="form-control" name="title" [(ngModel)]="form.title"
                placeholder="e.g. Student Council President 2024" required />
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-control" name="description" [(ngModel)]="form.description"
                placeholder="Describe the election purpose and rules..." rows="4"></textarea>
            </div>
          </div>

          <div class="form-section">
            <h3>Schedule</h3>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Start Date & Time *</label>
                <input class="form-control" type="datetime-local" name="start_time"
                  [(ngModel)]="form.start_time" required />
              </div>
              <div class="form-group">
                <label class="form-label">End Date & Time *</label>
                <input class="form-control" type="datetime-local" name="end_time"
                  [(ngModel)]="form.end_time" required />
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3>Candidates</h3>
            <div class="form-group">
              <label class="form-label">Search & Add Candidates *</label>
              <input class="form-control" type="text" [(ngModel)]="searchQuery" name="searchQuery"
                (input)="onSearch()" placeholder="Search by name or student ID..." autocomplete="off" />
              
              @if (searchResults.length > 0) {
                <div class="search-results card" style="margin-top: 0.5rem; max-height: 200px; overflow-y: auto; padding: 0;">
                  @for (user of searchResults; track user.id) {
                    <div class="search-item candidate-search-item"
                         (click)="selectCandidate(user)">
                      <div class="candidate-name">{{ user.full_name }}</div>
                      <div class="candidate-meta text-sm text-muted">{{ user.email }}</div>
                      <div class="candidate-meta text-sm text-muted">
                        {{ user.student_id || 'No student ID' }} • {{ user.department || 'No department' }}
                      </div>
                    </div>
                  }
                </div>
              }
            </div>

            @if (selectedCandidates.length > 0) {
              <div class="selected-candidates" style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
                @for (c of selectedCandidates; track c.id) {
                  <div class="card" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem;">
                    <div>
                      <div class="candidate-name">{{ c.full_name }}</div>
                      <div class="candidate-meta text-sm text-muted">{{ c.email }}</div>
                      <div class="candidate-meta text-sm text-muted">
                        {{ c.student_id || 'No student ID' }} • {{ c.department || 'No department' }}
                      </div>
                    </div>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="removeCandidate(c.id)" style="color: #dc2626;">Remove</button>
                  </div>
                }
              </div>
            }
          </div>

          <div class="form-section">
            <h3>Settings</h3>
            <div class="toggle-row">
              <div>
                <div style="font-weight:600;font-size:0.9rem;">Public Results</div>
                <div class="text-muted text-sm">Allow anyone to view results during and after the election</div>
              </div>
              <label class="toggle">
                <input type="checkbox" name="is_public_results" [(ngModel)]="form.is_public_results">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          @if (error()) { <div class="alert alert-error">⚠️ {{ error() }}</div> }
          @if (success()) { <div class="alert alert-success">✅ {{ success() }}</div> }

          <div class="form-actions">
            <a routerLink="/elections" class="btn btn-ghost">Cancel</a>
            <button type="submit" class="btn btn-primary" [disabled]="loading()">
              @if (loading()) { <span class="spinner"></span> }
              {{ loading() ? 'Creating…' : 'Create Election' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .page-wrapper { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; }
    .page-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .page-header h1 { font-size: 1.75rem; }
    .form-card { display: flex; flex-direction: column; gap: 2rem; padding: 2.5rem; border-radius: var(--radius-xl); }
    .form-section { display: flex; flex-direction: column; gap: 1.1rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--clr-border); }
    .form-section:last-of-type { border-bottom: none; }
    .form-section h3 { font-size: 1rem; color: var(--clr-text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .candidate-search-item { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-soft); cursor: pointer; }
    .candidate-search-item:hover { background: var(--bg-surface-soft); }
    .candidate-name { font-weight: 600; color: var(--text-strong); }
    .candidate-meta { margin-top: 0.2rem; overflow-wrap: anywhere; }
    .toggle-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .toggle { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; inset: 0; background: var(--clr-surface-3); border-radius: 24px; cursor: pointer; transition: background 0.2s; }
    .toggle-slider::before { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; background: white; border-radius: 50%; transition: transform 0.2s; }
    .toggle input:checked + .toggle-slider { background: var(--clr-primary); }
    .toggle input:checked + .toggle-slider::before { transform: translateX(20px); }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.75rem; }
    @media(max-width:540px) { .form-grid { grid-template-columns: 1fr; } }
  `],
})
export class ElectionFormComponent {
  private elecSvc = inject(ElectionService);
  private authSvc = inject(AuthService);
  private router  = inject(Router);

  form = { title: '', description: '', start_time: '', end_time: '', is_public_results: true };
  loading = signal(false);
  error   = signal('');
  success = signal('');

  searchQuery = '';
  searchResults: User[] = [];
  selectedCandidates: User[] = [];
  searchTimeout: any;

  onSearch() {
    clearTimeout(this.searchTimeout);
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      return;
    }
    this.searchTimeout = setTimeout(() => {
      this.authSvc.searchUsers(this.searchQuery).subscribe({
        next: (users) => {
          this.searchResults = users.filter(u => !this.selectedCandidates.some(c => c.id === u.id));
        },
        error: () => this.searchResults = []
      });
    }, 300);
  }

  selectCandidate(user: User) {
    if (!this.selectedCandidates.some(c => c.id === user.id)) {
      this.selectedCandidates.push(user);
    }
    this.searchQuery = '';
    this.searchResults = [];
  }

  removeCandidate(id: string) {
    this.selectedCandidates = this.selectedCandidates.filter(c => c.id !== id);
  }

  onSubmit() {
    if (this.selectedCandidates.length < 2) {
      this.error.set('Minimum 2 candidates required to create an election.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const dto: CreateElectionDto = {
      title:             this.form.title,
      description:       this.form.description || undefined,
      start_time:        new Date(this.form.start_time).toISOString(),
      end_time:          new Date(this.form.end_time).toISOString(),
      is_public_results: this.form.is_public_results,
    };

    this.elecSvc.create(dto).subscribe({
      next: (e) => {
        const requests = this.selectedCandidates.map(c => 
          this.elecSvc.addCandidate(e.id, { user_id: c.id })
        );

        if (requests.length > 0) {
          forkJoin(requests).subscribe({
            next: () => {
              this.success.set('Election created successfully!');
              setTimeout(() => this.router.navigate(['/elections', e.id]), 1500);
            },
            error: (err) => {
              this.error.set('Election created, but failed to add some candidates.');
              this.loading.set(false);
            }
          });
        } else {
          this.success.set('Election created successfully!');
          setTimeout(() => this.router.navigate(['/elections', e.id]), 1500);
        }
      },
      error: (e) => {
        this.error.set(e.error?.error ?? 'Failed to create election.');
        this.loading.set(false);
      },
    });
  }
}
