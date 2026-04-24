import { Component, inject, signal } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule }   from '@angular/forms';
import { AuthService }   from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <section class="auth-card card fade-in">
        <div class="auth-copy">
          <div class="eyebrow">Secure campus voting</div>
          <h1>Welcome back</h1>
          <p class="text-muted">Sign in to review elections, manage ballots, and track live results in one clean workspace.</p>
        </div>

        <form (ngSubmit)="onLogin()" #loginForm="ngForm">
          <div class="form-group">
            <label class="form-label">Email address</label>
            <input
              class="form-control"
              type="email" name="email"
              [(ngModel)]="email"
              placeholder="you@university.edu"
              required autocomplete="email" />
          </div>

          <div class="form-group">
            <label class="form-label">Password</label>
            <div class="input-suffix">
              <input
                class="form-control"
                [type]="showPassword() ? 'text' : 'password'"
                name="password"
                [(ngModel)]="password"
                placeholder="••••••••"
                required autocomplete="current-password" />
              <button type="button" class="toggle-pw" (click)="showPassword.set(!showPassword())">
                <i [class]="showPassword() ? 'ri-eye-off-line' : 'ri-eye-line'"></i>
              </button>
            </div>
          </div>

          @if (error()) {
            <div class="alert alert-error"><i class="ri-error-warning-line"></i> {{ error() }}</div>
          }

          <button type="submit" class="btn btn-primary w-full btn-lg" [disabled]="loading()">
            @if (loading()) { <span class="spinner"></span> }
            {{ loading() ? 'Signing in…' : 'Sign In' }}
          </button>
        </form>

        <p class="auth-footer text-center text-sm">
          Don't have an account?
          <a routerLink="/auth/register">Create one</a>
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
      width: min(100%, 480px);
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

    .input-suffix {
      position: relative;
    }

    .input-suffix .form-control {
      padding-right: 3rem;
    }

    .toggle-pw {
      position: absolute;
      right: 0.8rem;
      top: 50%;
      transform: translateY(-50%);
      border: 0;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
    }

    .auth-footer {
      margin-top: 1.25rem;
      color: var(--text-muted);
    }

    .auth-footer a {
      color: #82e8f3;
      font-weight: 600;
    }
  `],
})
export class LoginComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  email       = '';
  password    = '';
  loading     = signal(false);
  error       = signal('');
  showPassword = signal(false);

  onLogin() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.email, this.password).subscribe({
      next:  () => this.router.navigate(['/dashboard']),
      error: (e) => {
        this.error.set(e.error?.error ?? 'Login failed. Please try again.');
        this.loading.set(false);
      },
    });
  }
}
