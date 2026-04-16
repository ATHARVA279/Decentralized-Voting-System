import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-wrapper container fade-in">
      <h1>⚙️ Admin Panel</h1>
      <p class="text-muted" style="margin-bottom:2rem;">System management and oversight</p>
      <div class="admin-grid">
        <a routerLink="/elections/create" class="admin-card card">
          <span class="icon">🗳️</span>
          <h3>Create Election</h3>
          <p>Set up a new academic council election</p>
        </a>
        <a routerLink="/elections" class="admin-card card">
          <span class="icon">📋</span>
          <h3>Manage Elections</h3>
          <p>Edit, cancel, or monitor existing elections</p>
        </a>
        <div class="admin-card card">
          <span class="icon">📊</span>
          <h3>Audit Trail</h3>
          <p>View immutable ledger of all system actions</p>
        </div>
        <div class="admin-card card">
          <span class="icon">👥</span>
          <h3>Users</h3>
          <p>View registered students and their voting activity</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-wrapper { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .admin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px,1fr)); gap: 1.25rem; }
    .admin-card { display: flex; flex-direction: column; gap: 0.75rem; cursor: pointer; text-decoration: none; color: var(--clr-text); }
    .admin-card:hover h3 { color: var(--clr-primary); }
    .icon { font-size: 2rem; }
    h3 { font-size: 1rem; }
    p { font-size: 0.85rem; color: var(--clr-text-muted); }
  `],
})
export class AdminComponent {}
