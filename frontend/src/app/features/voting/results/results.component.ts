import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }    from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ElectionService, ElectionResult } from '../../../core/services/election.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-wrapper container fade-in">
      <div class="page-header">
        <a routerLink="/dashboard" class="btn btn-ghost btn-sm">← Back</a>
        <div class="live-indicator" [class.is-live]="isLive()">
          <span class="dot"></span>
          {{ isLive() ? 'Live Results' : 'Final Results' }}
        </div>
      </div>

      <h1>{{ electionTitle() }}</h1>
      <p class="text-muted">{{ totalVotes() }} votes cast</p>

      @if (loading()) {
        <div class="loading-state">
          <div class="spinner" style="width:40px;height:40px;border-width:3px;"></div>
        </div>
      } @else if (error()) {
        <div class="alert alert-error">{{ error() }}</div>
      } @else {
        <div class="results-list">
          @for (result of results(); track result.candidate_id; let i = $index) {
            <div class="result-row" [class.winner]="i === 0 && !isLive()">
              <div class="rank">
                @if (i === 0 && !isLive()) { <i class="ri-trophy-line"></i> } @else { {{ i + 1 }} }
              </div>
              <div class="candidate-info">
                <div class="candidate-avatar">{{ result.candidate_name.charAt(0) }}</div>
                <div>
                  <div class="candidate-name">{{ result.candidate_name }}</div>
                  @if (result.candidate_department) {
                    <div class="text-xs text-muted">{{ result.candidate_department }}</div>
                  }
                </div>
              </div>
              <div class="vote-stats">
                <div class="vote-count">{{ result.vote_count }}</div>
                <div class="vote-pct text-muted text-sm">{{ result.vote_percentage | number:'1.1-1' }}%</div>
              </div>
              <div class="progress-col">
                <div class="progress-track">
                  <div class="progress-fill"
                       [style.width.%]="result.vote_percentage ?? 0"
                       [class.winner-fill]="i === 0"></div>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page-wrapper { max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    .live-indicator { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 600; color: var(--clr-text-muted); }
    .live-indicator.is-live { color: var(--clr-success); }
    .live-indicator.is-live .dot { background: var(--clr-success); animation: pulse-dot 1.5s infinite; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--clr-text-dim); }
    @keyframes pulse-dot { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
    .loading-state { display:flex; justify-content:center; padding:4rem; }
    .results-list { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 2rem; }
    .result-row {
      display: grid; grid-template-columns: 40px 1fr auto 200px;
      align-items: center; gap: 1.25rem;
      padding: 1.25rem 1.5rem;
      background: var(--clr-surface); border: 1px solid var(--clr-border);
      border-radius: 12px; transition: all 0.2s;
    }
    .result-row.winner { border-color: rgba(108,99,255,0.5); background: rgba(108,99,255,0.07); box-shadow: 0 0 20px rgba(108,99,255,0.15); }
    .rank { font-size: 1.1rem; font-weight: 700; color: var(--clr-text-muted); text-align: center; }
    .candidate-info { display: flex; align-items: center; gap: 0.875rem; }
    .candidate-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--clr-primary), var(--clr-secondary)); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; color: white; flex-shrink: 0; }
    .candidate-name { font-weight: 600; font-size: 0.95rem; }
    .vote-stats { text-align: right; }
    .vote-count { font-size: 1.25rem; font-weight: 700; }
    .progress-col { min-width: 0; }
    .winner-fill { background: linear-gradient(90deg, var(--clr-primary), var(--clr-secondary)) !important; }
    @media(max-width:640px) { .result-row { grid-template-columns: 36px 1fr; } .progress-col, .vote-stats { display: none; } }
  `],
})
export class ResultsComponent implements OnInit {
  private route   = inject(ActivatedRoute);
  private elecSvc = inject(ElectionService);

  electionId    = signal('');
  electionTitle = signal('');
  results       = signal<ElectionResult[]>([]);
  totalVotes    = signal(0);
  loading       = signal(true);
  isLive        = signal(false);
  error         = signal('');

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.electionId.set(id);

    this.elecSvc.get(id).subscribe(e => {
      this.electionTitle.set(e.title);
      this.isLive.set(e.status === 'active' && e.is_public_results);
    });

    this.loadResults(id);
  }

  loadResults(id: string) {
    this.elecSvc.getResults(id).subscribe({
      next: res => {
        this.results.set(res.sort((a, b) => b.vote_count - a.vote_count));
        this.totalVotes.set(res.reduce((sum, r) => sum + r.vote_count, 0));
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e.error?.error ?? 'Results are not available yet.');
        this.loading.set(false);
      },
    });
  }
}
