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
      <!-- Glow orbs -->
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>

      <div class="auth-card fade-in">
        <div class="auth-header">
          <div class="logo">🗳️</div>
          <h1>Welcome back</h1>
          <p class="text-muted">Sign in to VoteChain</p>
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
                {{ showPassword() ? '🙈' : '👁️' }}
              </button>
            </div>
          </div>

          @if (error()) {
            <div class="alert alert-error">⚠️ {{ error() }}</div>
          }

          <button type="submit" class="btn btn-primary w-full btn-lg" [disabled]="loading()">
            @if (loading()) { <span class="spinner"></span> }
            {{ loading() ? 'Signing in…' : 'Sign In' }}
          </button>
        </form>

        <p class="auth-footer text-center text-muted text-sm">
          Don't have an account?
          <a routerLink="/auth/register">Create one →</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 2rem; position: relative; overflow: hidden;
    }
    .orb {
      position: fixed; border-radius: 50%; filter: blur(80px); pointer-events: none;
      animation: float 8s ease-in-out infinite;
    }
    .orb-1 {
      width: 400px; height: 400px; top: -100px; left: -100px;
      background: radial-gradient(circle, rgba(108,99,255,0.25), transparent 70%);
    }
    .orb-2 {
      width: 350px; height: 350px; bottom: -100px; right: -50px;
      background: radial-gradient(circle, rgba(0,212,184,0.2), transparent 70%);
      animation-delay: -4s;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0) scale(1); }
      50%       { transform: translateY(-20px) scale(1.05); }
    }
    .auth-card {
      width: 100%; max-width: 420px; z-index: 1;
      background: rgba(20,23,40,0.85);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px; padding: 2.5rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(108,99,255,0.1);
    }
    .auth-header { text-align: center; margin-bottom: 2rem; }
    .logo { font-size: 3rem; margin-bottom: 1rem; display: block; }
    .auth-header h1 { font-size: 1.75rem; margin-bottom: 0.4rem; }
    form { display: flex; flex-direction: column; gap: 1.25rem; }
    .input-suffix { position: relative; }
    .input-suffix .form-control { padding-right: 3rem; }
    .toggle-pw {
      position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer; font-size: 1rem; opacity: 0.7;
    }
    .auth-footer { margin-top: 1.5rem; }
    .auth-footer a { color: var(--clr-primary); font-weight: 600; }
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
