import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }    from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ElectionService, Candidate, Election } from '../../../core/services/election.service';
import { VoteService }     from '../../../core/services/vote.service';

@Component({
  selector: 'app-ballot',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-wrapper container fade-in">
      @if (alreadyVoted()) {
        <div class="already-voted-banner">
          <span><i class="ri-checkbox-circle-fill" style="color: #22c55e;"></i></span>
          <div>
            <strong>You've already voted!</strong>
            <p>Your vote has been recorded securely on the ledger.</p>
          </div>
        </div>
      }

      <div class="ballot-header">
        <h1>{{ election()?.title }}</h1>
        <p class="text-muted">{{ election()?.description }}</p>
        @if (election()) {
          <div class="time-info text-sm text-muted">
            <i class="ri-time-line"></i> Closes {{ formatDate(election()!.end_time) }}
          </div>
        }
      </div>

      @if (loading()) {
        <div class="loading-grid">
          @for (i of [1,2,3]; track i) { <div class="skeleton-card"></div> }
        </div>
      } @else if (election() && election()!.status !== 'active') {
        <div class="alert alert-error">
          Voting is not open for this election yet. It will become available when the start time is reached.
        </div>
      } @else {
        <div class="candidates-grid">
          @for (c of candidates(); track c.id) {
            <div class="candidate-card"
                 [class.selected]="selectedId() === c.id"
                 [class.disabled]="alreadyVoted()"
                 (click)="!alreadyVoted() && select(c.id)">
              <div class="candidate-avatar-lg">{{ c.name.charAt(0) }}</div>
              <div class="candidate-details">
                <h3>{{ c.name }}</h3>
                @if (c.department) { <div class="dept badge badge-upcoming">{{ c.department }}</div> }
                @if (c.position) { <div class="position text-sm text-muted">{{ c.position }}</div> }
                @if (c.manifesto) { <p class="manifesto text-sm text-muted">{{ c.manifesto }}</p> }
              </div>
              <div class="selection-indicator">
                @if (selectedId() === c.id) { <i class="ri-check-line"></i> }
              </div>
            </div>
          }
        </div>

        @if (!alreadyVoted()) {
          <div class="vote-action">
            @if (error()) { <div class="alert alert-error"><i class="ri-error-warning-line"></i> {{ error() }}</div> }
            @if (success()) { <div class="alert alert-success"><i class="ri-checkbox-circle-line"></i> {{ success() }}</div> }
            <button class="btn btn-primary btn-lg"
                    [disabled]="!selectedId() || casting()"
                    (click)="confirmVote()">
              @if (casting()) { <span class="spinner"></span> }
              {{ casting() ? 'Recording your vote…' : 'Cast My Vote' }}
            </button>
            <p class="text-xs text-muted text-center">
              <i class="ri-lock-2-line"></i> Your vote is final and cannot be changed after submission
            </p>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page-wrapper { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }
    .already-voted-banner { display:flex; align-items:center; gap:1rem; padding:1.25rem 1.5rem; background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); border-radius:12px; margin-bottom:2rem; font-size:0.95rem; color:#86efac; }
    .already-voted-banner span { font-size:2rem; }
    .already-voted-banner p { margin:0; font-size:0.85rem; opacity:0.8; }
    .ballot-header { margin-bottom:2rem; }
    .ballot-header h1 { font-size:1.8rem; margin-bottom:0.5rem; }
    .time-info { margin-top:0.5rem; }
    .candidates-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1.25rem; }
    .candidate-card {
      background:var(--clr-surface); border:2px solid var(--clr-border); border-radius:16px;
      padding:1.5rem; cursor:pointer; transition:all 0.2s; position:relative;
      display:flex; flex-direction:column; gap:1rem;
    }
    .candidate-card:hover:not(.disabled) { border-color:var(--clr-primary); transform:translateY(-2px); box-shadow:0 8px 30px var(--clr-primary-glow); }
    .candidate-card.selected { border-color:var(--clr-primary); background:rgba(108,99,255,0.1); box-shadow:0 0 25px var(--clr-primary-glow); }
    .candidate-card.disabled { cursor:default; opacity:0.7; }
    .candidate-avatar-lg { width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg,var(--clr-primary),var(--clr-secondary)); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.5rem; color:white; }
    .candidate-details { flex:1; }
    .candidate-details h3 { font-size:1.1rem; margin-bottom:0.4rem; }
    .dept { margin-bottom:0.4rem; display:inline-flex; }
    .position { margin-bottom:0.5rem; font-weight:500; }
    .manifesto { line-height:1.5; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
    .selection-indicator { position:absolute; top:1rem; right:1rem; width:28px; height:28px; border-radius:50%; background:var(--clr-primary); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; opacity:0; transition:opacity 0.2s; }
    .candidate-card.selected .selection-indicator { opacity:1; }
    .vote-action { margin-top:2.5rem; display:flex; flex-direction:column; align-items:center; gap:1rem; }
    .vote-action button { min-width:250px; }
    .skeleton-card { height:200px; background:var(--clr-surface); border:1px solid var(--clr-border); border-radius:16px; animation:pulse-sk 1.5s ease-in-out infinite; }
    .loading-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1.25rem; }
    @keyframes pulse-sk { 0%,100%{opacity:1;}50%{opacity:0.4;} }
  `],
})
export class BallotComponent implements OnInit {
  private route   = inject(ActivatedRoute);
  private router  = inject(Router);
  private elecSvc = inject(ElectionService);
  private voteSvc = inject(VoteService);

  election    = signal<Election | null>(null);
  candidates  = signal<Candidate[]>([]);
  selectedId  = signal<string | null>(null);
  loading     = signal(true);
  casting     = signal(false);
  alreadyVoted = signal(false);
  error       = signal('');
  success     = signal('');

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.elecSvc.get(id).subscribe(e => this.election.set(e));
    this.elecSvc.getCandidates(id).subscribe(c => { this.candidates.set(c); this.loading.set(false); });
    this.voteSvc.status(id).subscribe(s => this.alreadyVoted.set(s.has_voted));
  }

  select(id: string) { this.selectedId.set(id); }

  confirmVote() {
    if (!this.selectedId()) return;
    if (this.election()?.status !== 'active') {
      this.error.set('Voting is not open for this election yet.');
      return;
    }
    this.casting.set(true);
    this.voteSvc.cast({
      election_id:  this.election()!.id,
      candidate_id: this.selectedId()!,
    }).subscribe({
      next: res => {
        this.success.set('Your vote has been recorded! Hash: ' + res.vote_hash.substring(0, 12) + '…');
        this.alreadyVoted.set(true);
        this.casting.set(false);
        setTimeout(() => this.router.navigate(['/elections', this.election()!.id, 'results']), 2500);
      },
      error: e => {
        this.error.set(e.error?.error ?? 'Vote failed. Please try again.');
        this.casting.set(false);
      },
    });
  }

  formatDate = (d: string) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
