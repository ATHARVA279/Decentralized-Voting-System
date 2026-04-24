import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }   from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ElectionService, Election, Candidate } from '../../../core/services/election.service';
import { AuthService }    from '../../../core/services/auth.service';

@Component({
  selector: 'app-election-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-wrapper container fade-in">
      <div class="breadcrumb">
        <a routerLink="/elections" class="btn btn-ghost btn-sm">← All Elections</a>
      </div>

      @if (loading()) {
        <div class="loading-state" style="display:flex;justify-content:center;padding:4rem;">
          <div class="spinner" style="width:40px;height:40px;border-width:3px;"></div>
        </div>
      } @else if (election()) {
        <div class="detail-header">
          <div class="header-left">
            <span class="badge" [class]="'badge-' + election()!.status">{{ election()!.status }}</span>
            <h1>{{ election()!.title }}</h1>
            <p class="text-muted">{{ election()!.description }}</p>
            <div class="meta-row text-sm text-muted">
              <span><i class="ri-calendar-line"></i> {{ formatDate(election()!.start_time) }}</span>
              <span>→</span>
              <span>{{ formatDate(election()!.end_time) }}</span>
            </div>
          </div>
          <div class="action-btns">
            @if (election()!.status === 'active') {
              <a [routerLink]="['/elections', election()!.id, 'vote']" class="btn btn-primary btn-lg"><i class="ri-checkbox-circle-line"></i> Vote Now</a>
            }
            @if (canViewResults()) {
              <a [routerLink]="['/elections', election()!.id, 'results']" class="btn btn-secondary"><i class="ri-bar-chart-box-line"></i> Results</a>
            }
            @if (canPublishResults()) {
              <button type="button" class="btn btn-primary" [disabled]="publishing()" (click)="publishResults()">
                @if (publishing()) { <span class="spinner"></span> }
                {{ publishing() ? 'Publishing…' : 'Publish Results' }}
              </button>
            }
          </div>
        </div>

        @if (message()) {
          <div class="alert alert-success" style="margin-bottom: 1.25rem;">{{ message() }}</div>
        }

        <div class="candidates-section">
          <h2>Candidates ({{ candidates().length }})</h2>
          <div class="candidates-row">
            @for (c of candidates(); track c.id) {
              <div class="cand-card card">
                <div class="cand-avatar">{{ c.name.charAt(0) }}</div>
                <div class="cand-name">{{ c.name }}</div>
                @if (c.department) { <div class="badge badge-upcoming text-xs">{{ c.department }}</div> }
                @if (c.position) { <div class="text-sm text-muted">{{ c.position }}</div> }
                @if (c.manifesto) { <p class="text-sm text-muted" style="line-height:1.5;">{{ c.manifesto }}</p> }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-wrapper { max-width: 1000px; margin: 0 auto; padding: 2rem 1.5rem; }
    .breadcrumb { margin-bottom: 1.5rem; }
    .detail-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; margin-bottom: 2.5rem; flex-wrap: wrap; }
    .header-left { display: flex; flex-direction: column; gap: 0.75rem; }
    .header-left h1 { font-size: 2rem; }
    .meta-row { display: flex; gap: 0.75rem; align-items: center; }
    .action-btns { display: flex; flex-direction: column; gap: 0.75rem; flex-shrink: 0; }
    .candidates-section h2 { font-size: 1.25rem; margin-bottom: 1.25rem; }
    .candidates-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
    .cand-card { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.6rem; padding: 1.5rem 1rem; }
    .cand-avatar { width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, var(--clr-primary), var(--clr-secondary)); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 800; color: white; }
    .cand-name { font-weight: 700; font-size: 1rem; }
  `],
})
export class ElectionDetailComponent implements OnInit {
  private route   = inject(ActivatedRoute);
  private elecSvc = inject(ElectionService);
  auth            = inject(AuthService);

  election   = signal<Election | null>(null);
  candidates = signal<Candidate[]>([]);
  loading    = signal(true);
  publishing = signal(false);
  message    = signal('');

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.elecSvc.get(id).subscribe(e => { this.election.set(e); this.loading.set(false); });
    this.elecSvc.getCandidates(id).subscribe(c => this.candidates.set(c));
  }

  canViewResults() {
    const election = this.election();
    if (!election) return false;
    if (election.status === 'active') return election.is_public_results;
    if (election.status === 'completed') return election.is_public_results || election.results_published;
    return false;
  }

  canPublishResults() {
    const election = this.election();
    return !!election
      && this.auth.isAdmin()
      && election.status === 'completed'
      && !election.is_public_results
      && !election.results_published;
  }

  publishResults() {
    const election = this.election();
    if (!election || !this.canPublishResults()) return;

    this.publishing.set(true);
    this.message.set('');
    this.elecSvc.publishResults(election.id).subscribe({
      next: (updated) => {
        this.election.set(updated);
        this.message.set('Results are now published for voters.');
        this.publishing.set(false);
      },
      error: () => {
        this.message.set('');
        this.publishing.set(false);
      },
    });
  }

  formatDate = (d: string) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
