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
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>

      <div class="auth-card fade-in">
        <div class="auth-header">
          <div class="logo">🗳️</div>
          <h1>Create account</h1>
          <p class="text-muted">Join VoteChain to participate in elections</p>
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

        <p class="auth-footer text-center text-muted text-sm">
          Already have an account? <a routerLink="/auth/login">Sign in →</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 2rem; position: relative; overflow: hidden;
    }
    .orb { position: fixed; border-radius: 50%; filter: blur(80px); pointer-events: none; animation: float 8s ease-in-out infinite; }
    .orb-1 { width: 400px; height: 400px; top: -100px; right: -100px; background: radial-gradient(circle, rgba(108,99,255,0.25), transparent 70%); }
    .orb-2 { width: 350px; height: 350px; bottom: -100px; left: -50px; background: radial-gradient(circle, rgba(247,37,133,0.15), transparent 70%); animation-delay: -4s; }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
    .auth-card {
      width: 100%; max-width: 480px; z-index: 1;
      background: rgba(20,23,40,0.9); backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 2.5rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .auth-header { text-align: center; margin-bottom: 2rem; }
    .logo { font-size: 2.5rem; margin-bottom: 0.75rem; display: block; }
    .auth-header h1 { font-size: 1.6rem; margin-bottom: 0.4rem; }
    form { display: flex; flex-direction: column; gap: 1.1rem; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .auth-footer { margin-top: 1.5rem; }
    .auth-footer a { color: var(--clr-primary); font-weight: 600; }
    @media (max-width: 480px) { .form-grid { grid-template-columns: 1fr; } }
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
