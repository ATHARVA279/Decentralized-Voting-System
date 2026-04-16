import { Component, inject } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { RouterLink, Router, RouterLinkActive } from '@angular/router';
import { AuthService }   from '../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="navbar">
      <div class="nav-inner">
        <a routerLink="/dashboard" class="nav-brand">
          <span class="brand-icon">🗳️</span>
          <span class="brand-name">VoteChain</span>
        </a>

        @if (auth.isLoggedIn()) {
          <div class="nav-links">
            <a routerLink="/dashboard" routerLinkActive="active" class="nav-link">Dashboard</a>
            <a routerLink="/elections" routerLinkActive="active" class="nav-link">Elections</a>
            @if (auth.isAdmin()) {
              <a routerLink="/admin" routerLinkActive="active" class="nav-link nav-link-admin">⚙️ Admin</a>
            }
          </div>

          <div class="nav-user">
            <div class="user-chip">
              <div class="user-avatar">{{ auth.user()?.full_name?.charAt(0) }}</div>
              <div class="user-meta">
                <span class="user-name">{{ auth.user()?.full_name }}</span>
                <span class="user-role">{{ auth.user()?.role }}</span>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" (click)="logout()">Sign out</button>
          </div>
        }
      </div>
    </nav>
  `,
  styles: [`
    .navbar {
      position: sticky; top: 0; z-index: 100;
      background: rgba(13,15,26,0.85); backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--clr-border);
    }
    .nav-inner { max-width: 1200px; margin: 0 auto; padding: 0 1.5rem; height: 64px; display: flex; align-items: center; gap: 2rem; }
    .nav-brand { display: flex; align-items: center; gap: 0.6rem; text-decoration: none; flex-shrink: 0; }
    .brand-icon { font-size: 1.4rem; }
    .brand-name { font-size: 1.1rem; font-weight: 800; background: linear-gradient(135deg, var(--clr-primary), var(--clr-secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .nav-links { display: flex; align-items: center; gap: 0.25rem; flex: 1; }
    .nav-link { padding: 0.4rem 0.9rem; border-radius: 8px; font-size: 0.9rem; font-weight: 500; color: var(--clr-text-muted); text-decoration: none; transition: all 0.2s; }
    .nav-link:hover { color: var(--clr-text); background: var(--clr-surface-2); }
    .nav-link.active { color: var(--clr-primary); background: rgba(108,99,255,0.1); }
    .nav-link-admin { color: var(--clr-warning) !important; }
    .nav-user { display: flex; align-items: center; gap: 0.75rem; margin-left: auto; }
    .user-chip { display: flex; align-items: center; gap: 0.6rem; }
    .user-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--clr-primary), var(--clr-secondary)); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; color: white; flex-shrink: 0; }
    .user-meta { display: flex; flex-direction: column; line-height: 1.2; }
    .user-name { font-size: 0.85rem; font-weight: 600; color: var(--clr-text); }
    .user-role { font-size: 0.7rem; color: var(--clr-text-muted); text-transform: capitalize; }
    @media (max-width: 640px) { .nav-links { display: none; } .user-meta { display: none; } }
  `],
})
export class NavbarComponent {
  auth   = inject(AuthService);
  router = inject(Router);

  logout() {
    this.auth.logout().subscribe({ error: () => {} });
  }
}
