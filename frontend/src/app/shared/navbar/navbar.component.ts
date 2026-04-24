import { Component, inject } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService }   from '../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="navbar">
      <div class="container nav-shell">
        <div class="nav-inner surface-panel">
          <a routerLink="/dashboard" class="nav-brand">
            <span class="brand-mark">V</span>
            <span class="brand-copy">
              <span class="brand-name">VoteChain</span>
              <span class="brand-subtitle">Campus voting workspace</span>
            </span>
          </a>

          @if (auth.isLoggedIn()) {
            <div class="nav-links">
              <a routerLink="/dashboard" routerLinkActive="active" class="nav-link">Dashboard</a>
              <a routerLink="/elections" routerLinkActive="active" class="nav-link">Elections</a>
              @if (auth.isAdmin()) {
                <a routerLink="/admin/users" routerLinkActive="active" class="nav-link">Users</a>
                <a routerLink="/admin/elections" routerLinkActive="active" class="nav-link">Admin Elections</a>
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
              <button class="btn btn-secondary btn-sm" (click)="logout()">Sign out</button>
            </div>
          }
        </div>
      </div>
    </nav>
  `,
  styles: [`
    .navbar {
      position: sticky;
      top: 0;
      z-index: 100;
      padding: 1.5rem 0 1rem;
      background: transparent;
      pointer-events: none;
    }

    .nav-shell {
      padding-bottom: 0;
      pointer-events: auto;
    }

    .nav-inner {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      min-height: 4.5rem;
      padding: 0 1rem;
    }

    .nav-brand {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      min-width: 0;
    }

    .brand-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: var(--radius-sm);
      background: var(--text-strong);
      color: var(--text-inverse);
      font-weight: 700;
      box-shadow: var(--shadow-sm);
    }

    .brand-copy {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .brand-name {
      color: var(--text-strong);
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    .brand-subtitle {
      color: var(--text-muted);
      font-size: 0.82rem;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-left: auto;
    }

    .nav-link {
      padding: 0.5rem 0.875rem;
      color: var(--text-muted);
      border-radius: var(--radius-sm);
      font-size: 0.94rem;
      font-weight: 500;
      transition: background-color var(--transition-fast), color var(--transition-fast);
    }

    .nav-link:hover,
    .nav-link.active {
      color: var(--text-strong);
      background: rgba(38, 198, 218, 0.12);
    }

    .nav-user {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .user-chip {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.35rem 0.5rem 0.35rem 0.35rem;
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-full);
      background: rgba(16, 27, 34, 0.92);
      box-shadow: var(--shadow-xs);
    }

    .user-avatar {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      background: rgba(38, 198, 218, 0.14);
      color: var(--text-strong);
      font-weight: 600;
      font-size: 0.875rem;
    }

    .user-meta {
      display: flex;
      flex-direction: column;
      gap: 0;
      min-width: 0;
    }

    .user-name {
      color: var(--text-strong);
      font-size: 0.875rem;
      font-weight: 500;
    }

    .user-role {
      color: var(--text-muted);
      font-size: 0.75rem;
      text-transform: capitalize;
    }

    @media (max-width: 900px) {
      .nav-inner {
        flex-wrap: wrap;
        justify-content: space-between;
      }

      .nav-links {
        order: 3;
        width: 100%;
        margin-left: 0;
        padding-top: 0.35rem;
      }
    }

    @media (max-width: 640px) {
      .brand-subtitle,
      .user-meta {
        display: none;
      }

      .nav-user {
        gap: 0.55rem;
      }
    }
  `],
})
export class NavbarComponent {
  auth = inject(AuthService);

  logout() {
    this.auth.logout().subscribe({ error: () => {} });
  }
}
