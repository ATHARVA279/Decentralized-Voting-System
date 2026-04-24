import { Component, inject, signal } from '@angular/core';
import { CommonModule }   from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule }    from '@angular/forms';
import { AuthService }    from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <section class="auth-card card fade-in">
        <div class="auth-copy">
          <div class="eyebrow">New account</div>
          <h1>Create account</h1>
          <p class="text-muted">Join your campus workspace to vote in live elections, track participation, and follow verified results.</p>
        </div>

        <form (ngSubmit)="onRegister()" #f="ngForm">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Full name</label>
              <input class="form-control" name="full_name" [(ngModel)]="form.full_name"
                placeholder="Priya Sharma" required />
            </div>
            <div class="form-group">
              <label class="form-label">Student ID</label>
              <input class="form-control" name="student_id" [(ngModel)]="form.student_id"
                placeholder="STU-2024-001" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Email address</label>
            <input class="form-control" type="email" name="email" [(ngModel)]="form.email"
              placeholder="priya@university.edu" required />
          </div>

          <div class="form-group">
            <label class="form-label">Department</label>
            <select class="form-control" name="department" [(ngModel)]="form.department">
              <option value="">Select department</option>
              <option>Computer Science</option>
              <option>Electronics</option>
              <option>Mechanical</option>
              <option>Civil</option>
              <option>Business Administration</option>
              <option>Arts & Humanities</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-control" type="password" name="password" [(ngModel)]="form.password"
              placeholder="Min. 8 characters" required minlength="8" />
          </div>

          @if (error()) {
            <div class="alert alert-error">⚠️ {{ error() }}</div>
          }
          @if (success()) {
            <div class="alert alert-success">✅ {{ success() }}</div>
          }

          <button type="submit" class="btn btn-primary w-full btn-lg" [disabled]="loading()">
            @if (loading()) { <span class="spinner"></span> }
            {{ loading() ? 'Creating account…' : 'Create Account' }}
          </button>
        </form>

        <p class="auth-footer text-center text-sm">
          Already have an account? <a routerLink="/auth/login">Sign in</a>
        </p>
      </section>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: calc(100vh - 5rem);
      display: grid;
      place-items: center;
      padding: 2rem 1rem 3rem;
    }

    .auth-card {
      width: min(100%, 560px);
      padding: 2rem;
      background: linear-gradient(180deg, rgba(18, 30, 38, 0.95) 0%, rgba(11, 21, 29, 0.98) 100%);
    }

    .auth-copy {
      margin-bottom: 1.75rem;
    }

    .eyebrow {
      display: inline-flex;
      padding: 0.35rem 0.7rem;
      margin-bottom: 1rem;
      background: var(--bg-accent-soft);
      color: #82e8f3;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 1.1rem;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
    }

    .auth-footer {
      margin-top: 1.25rem;
      color: var(--text-muted);
    }

    .auth-footer a {
      color: #82e8f3;
      font-weight: 600;
    }

    @media (max-width: 640px) {
      .form-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class RegisterComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  form = { full_name: '', email: '', password: '', student_id: '', department: '' };
  loading = signal(false);
  error   = signal('');
  success = signal('');

  onRegister() {
    this.loading.set(true);
    this.error.set('');
    this.auth.register(this.form).subscribe({
      next:  () => this.router.navigate(['/dashboard']),
      error: (e) => {
        this.error.set(e.error?.error ?? 'Registration failed.');
        this.loading.set(false);
      },
    });
  }
}
