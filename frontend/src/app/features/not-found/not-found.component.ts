import { Component } from '@angular/core';
import { RouterLink }  from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div style="min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem;">
      <div style="font-size:5rem;margin-bottom:1.5rem;">🗳️</div>
      <h1 style="font-size:4rem;font-weight:800;margin-bottom:0.5rem;">404</h1>
      <p class="text-muted" style="margin-bottom:2rem;">This page doesn't exist or has been moved.</p>
      <a routerLink="/dashboard" class="btn btn-primary">← Back to Dashboard</a>
    </div>
  `,
})
export class NotFoundComponent {}
