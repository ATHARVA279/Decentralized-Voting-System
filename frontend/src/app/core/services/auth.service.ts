import { Injectable, signal, computed } from '@angular/core';
import { HttpClient }                   from '@angular/common/http';
import { Router }                       from '@angular/router';
import { tap, catchError }              from 'rxjs/operators';
import { throwError }                   from 'rxjs';
import { environment }                  from '../../../environments/environment';

export interface User {
  id:         string;
  email:      string;
  full_name:  string;
  student_id: string | null;
  department: string | null;
  role:       'voter' | 'admin';
  created_at: string;
}

export interface AdminUser extends User {
  is_active: boolean;
  email_verified: boolean;
  updated_at: string;
}

export interface AdminUserListResponse {
  data: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuthResponse {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  expires_in:    number;
  user:          User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = `${environment.authServiceUrl}/api/auth`;
  private readonly ADMIN_API = `${environment.authServiceUrl}/api/admin`;

  // Reactive signals — components subscribe without boilerplate
  private _user    = signal<User | null>(this.loadUser());
  private _token   = signal<string | null>(localStorage.getItem('access_token'));

  readonly user         = this._user.asReadonly();
  readonly token        = this._token.asReadonly();
  readonly isLoggedIn   = computed(() => !!this._token());
  readonly isAdmin      = computed(() => this._user()?.role?.toLowerCase() === 'admin');
  readonly currentUserId = computed(() => this._user()?.id ?? null);

  constructor(private http: HttpClient, private router: Router) {}

  register(data: { email: string; password: string; full_name: string; student_id?: string; department?: string }) {
    const payload = {
      ...data,
      student_id: data.student_id?.trim() || undefined,
      department: data.department?.trim() || undefined,
    };

    return this.http.post<AuthResponse>(`${this.API}/register`, payload).pipe(
      tap(res => this.saveSession(res)),
    );
  }

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.API}/login`, { email, password }).pipe(
      tap(res => this.saveSession(res)),
    );
  }

  logout() {
    return this.http.post(`${this.API}/logout`, {}).pipe(
      tap(() => this.clearSession()),
      catchError(err => { this.clearSession(); return throwError(() => err); }),
    );
  }

  refreshToken() {
    const refresh_token = localStorage.getItem('refresh_token');
    if (!refresh_token) return throwError(() => new Error('No refresh token'));

    return this.http.post<{ access_token: string; expires_in: number }>(
      `${this.API}/refresh`, { refresh_token }
    ).pipe(
      tap(res => {
        localStorage.setItem('access_token', res.access_token);
        this._token.set(res.access_token);
      }),
    );
  }

  getMe() {
    return this.http.get<User>(`${this.API}/me`).pipe(
      tap(user => this._user.set(user)),
    );
  }

  searchUsers(query: string) {
    return this.http.get<User[]>(`${environment.authServiceUrl}/api/users/search`, { params: { q: query } });
  }

  adminListUsers(params: {
    q?: string;
    role?: 'admin' | 'voter';
    is_active?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const query: Record<string, string> = {};
    if (params.q?.trim()) query['q'] = params.q.trim();
    if (params.role) query['role'] = params.role;
    if (params.is_active !== undefined) query['is_active'] = String(params.is_active);
    if (params.limit !== undefined) query['limit'] = String(params.limit);
    if (params.offset !== undefined) query['offset'] = String(params.offset);

    return this.http.get<AdminUserListResponse>(`${this.ADMIN_API}/users`, { params: query });
  }

  adminUpdateUserStatus(userId: string, is_active: boolean) {
    return this.http.patch<AdminUser>(`${this.ADMIN_API}/users/${userId}/status`, { is_active });
  }

  private saveSession(res: AuthResponse) {
    localStorage.setItem('access_token',  res.access_token);
    localStorage.setItem('refresh_token', res.refresh_token);
    localStorage.setItem('user',          JSON.stringify(res.user));
    this._token.set(res.access_token);
    this._user.set(res.user);
  }

  private clearSession() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    this._token.set(null);
    this._user.set(null);
    this.router.navigate(['/auth/login']);
  }

  private loadUser(): User | null {
    try   { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  }
}
