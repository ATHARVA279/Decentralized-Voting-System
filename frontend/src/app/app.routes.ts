import { Routes } from '@angular/router';
import { authGuard }      from './core/guards/auth.guard';
import { adminGuard }     from './core/guards/admin.guard';
import { guestGuard }     from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full',
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then(m => m.LoginComponent),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register.component').then(m => m.RegisterComponent),
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'elections',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/elections/elections-list/elections-list.component').then(m => m.ElectionsListComponent),
      },
      {
        path: 'create',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/elections/election-form/election-form.component').then(m => m.ElectionFormComponent),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/elections/election-detail/election-detail.component').then(m => m.ElectionDetailComponent),
      },
      {
        path: ':id/vote',
        loadComponent: () =>
          import('./features/voting/ballot/ballot.component').then(m => m.BallotComponent),
      },
      {
        path: ':id/results',
        loadComponent: () =>
          import('./features/voting/results/results.component').then(m => m.ResultsComponent),
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin/admin.component').then(m => m.AdminComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then(m => m.NotFoundComponent),
  },
];
