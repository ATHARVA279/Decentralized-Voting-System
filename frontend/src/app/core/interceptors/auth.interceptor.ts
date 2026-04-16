import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject }         from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService }    from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth  = inject(AuthService);
  const token = auth.token();

  // Attach Bearer token if available
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Auto-refresh on 401 (expired token)
      if (error.status === 401 && token && !req.url.includes('/refresh')) {
        return auth.refreshToken().pipe(
          switchMap(res => {
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${res.access_token}` },
            });
            return next(retryReq);
          }),
          catchError(refreshErr => {
            // Refresh failed — force logout
            auth.logout().subscribe();
            return throwError(() => refreshErr);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
