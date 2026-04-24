use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{extract::{Path, Query, State}, Extension, Json};
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, QueryBuilder};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::{
    db::AppState,
    errors::AppError,
    models::user::{
        LoginRequest, RegisterRequest, TokenResponse, User, UserResponse,
    },
};
use shared::Claims;

// Access token: 15 minutes; Refresh token: 7 days
const ACCESS_TOKEN_TTL:  i64 = 15 * 60;
const REFRESH_TOKEN_TTL: i64 = 7 * 24 * 60 * 60;

/// POST /api/auth/register
pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<TokenResponse>, AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    let student_id = req
        .student_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned);
    let department = req
        .department
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned);

    // Check for existing user
    let existing = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE email = $1"
    )
    .persistent(false)
    .bind(&req.email)
    .fetch_one(&state.db)
    .await?;

    if existing > 0 {
        return Err(AppError::UserAlreadyExists);
    }

    // Hash password with Argon2id (memory-hard, secure)
    let salt     = SaltString::generate(&mut OsRng);
    let argon2   = Argon2::default();
    let pw_hash  = argon2
        .hash_password(req.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Hashing error: {}", e)))?
        .to_string();

    // Insert user
    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (email, password_hash, full_name, student_id, department, role)
        VALUES ($1, $2, $3, $4, $5, 'voter')
        RETURNING *
        "#,
    )
    .persistent(false)
    .bind(&req.email)
    .bind(&pw_hash)
    .bind(&req.full_name)
    .bind(&student_id)
    .bind(&department)
    .fetch_one(&state.db)
    .await?;

    // Log to audit trail
    write_audit_log(
        &state,
        "user_registered",
        Some(user.id),
        "user",
        Some(user.id),
        serde_json::json!({ "email": user.email }),
    )
    .await?;

    let token_response = generate_tokens(&state, &user).await?;
    Ok(Json(token_response))
}

/// POST /api/auth/login
pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<TokenResponse>, AppError> {
    req.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE email = $1 AND is_active = TRUE"
    )
    .persistent(false)
    .bind(&req.email)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::InvalidCredentials)?;

    // Verify password
    let parsed_hash = PasswordHash::new(&user.password_hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Hash parse error: {}", e)))?;

    Argon2::default()
        .verify_password(req.password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::InvalidCredentials)?;

    // Write audit
    write_audit_log(
        &state,
        "user_login",
        Some(user.id),
        "user",
        Some(user.id),
        serde_json::json!({ "email": user.email }),
    )
    .await?;

    let token_response = generate_tokens(&state, &user).await?;
    Ok(Json(token_response))
}

/// POST /api/auth/refresh — exchange refresh token for new access token
pub async fn refresh_token(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    let refresh_token = body["refresh_token"]
        .as_str()
        .ok_or_else(|| AppError::Validation("refresh_token required".into()))?;

    // Hash the refresh token to look it up in DB
    let token_hash = hex::encode(Sha256::digest(refresh_token.as_bytes()));

    #[derive(sqlx::FromRow)]
    struct RefreshRow {
        user_id: Uuid,
        expires_at: chrono::DateTime<chrono::Utc>,
        revoked: bool,
    }

    let row = sqlx::query_as::<_, RefreshRow>(
        r#"
        SELECT rt.user_id, rt.expires_at, rt.revoked
        FROM refresh_tokens rt
        WHERE rt.token_hash = $1
        "#
    )
    .persistent(false)
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::TokenInvalid)?;

    if row.revoked {
        return Err(AppError::TokenInvalid);
    }
    if row.expires_at < Utc::now() {
        return Err(AppError::TokenExpired);
    }

    let mut tx = state.db.begin().await?;

    sqlx::query(
        r#"
        UPDATE refresh_tokens
        SET revoked = TRUE
        WHERE token_hash = $1
        "#,
    )
    .bind(token_hash.as_str())
    .execute(&mut *tx)
    .await?;

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .persistent(false)
        .bind(row.user_id)
        .fetch_one(&mut *tx)
        .await?;

    let now    = Utc::now().timestamp();
    let jti    = Uuid::new_v4().to_string();
    let claims = Claims {
        sub:   user.id.to_string(),
        email: user.email.clone(),
        role:  format!("{:?}", user.role).to_lowercase(),
        iat:   now,
        exp:   now + ACCESS_TOKEN_TTL,
        jti,
    };

    let access_token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encode error: {}", e)))?;

    let new_refresh_token = Uuid::new_v4().to_string() + &Uuid::new_v4().to_string();
    let new_token_hash = hex::encode(Sha256::digest(new_refresh_token.as_bytes()));
    let new_expires_at = Utc::now() + chrono::Duration::seconds(REFRESH_TOKEN_TTL);

    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(user.id)
    .bind(new_token_hash)
    .bind(new_expires_at)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(serde_json::json!({
        "access_token": access_token,
        "token_type":   "Bearer",
        "expires_in":   ACCESS_TOKEN_TTL,
        "refresh_token": new_refresh_token
    })))
}

/// GET /api/auth/me — returns authenticated user profile
pub async fn get_me(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
) -> Result<Json<UserResponse>, AppError> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::TokenInvalid)?;

    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .persistent(false)
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::UserNotFound)?;

    Ok(Json(UserResponse::from(user)))
}

/// POST /api/auth/logout — blacklists the JWT in Redis
pub async fn logout(
    State(state): State<Arc<AppState>>,
    axum::Extension(claims): axum::Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Blacklist the token JTI in Redis until it expires
    let ttl = claims.exp - Utc::now().timestamp();
    if ttl > 0 {
        let mut con = state.redis.clone();
        let key = format!("blacklist:jti:{}", claims.jti);
        redis::cmd("SETEX")
            .arg(&key)
            .arg(ttl)
            .arg("1")
            .query_async::<_, ()>(&mut con)
            .await?;
    }

    let user_id = Uuid::parse_str(&claims.sub).ok();
    write_audit_log(&state, "user_logout", user_id, "user", user_id, serde_json::json!({})).await?;

    Ok(Json(serde_json::json!({ "message": "Logged out successfully" })))
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async fn generate_tokens(
    state:      &AppState,
    user:       &User,
) -> Result<TokenResponse, AppError> {
    let now = Utc::now().timestamp();
    let jti = Uuid::new_v4().to_string();

    let access_claims = Claims {
        sub:   user.id.to_string(),
        email: user.email.clone(),
        role:  format!("{:?}", user.role).to_lowercase(),
        iat:   now,
        exp:   now + ACCESS_TOKEN_TTL,
        jti,
    };

    let access_token = encode(
        &Header::default(),
        &access_claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encode: {}", e)))?;

    let refresh_token = Uuid::new_v4().to_string() + &Uuid::new_v4().to_string();
    let token_hash    = hex::encode(Sha256::digest(refresh_token.as_bytes()));
    let expires_at    = Utc::now() + chrono::Duration::seconds(REFRESH_TOKEN_TTL);

    sqlx::query(
        r#"
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(user.id)
    .bind(token_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    Ok(TokenResponse {
        access_token,
        token_type:    "Bearer".into(),
        expires_in:    ACCESS_TOKEN_TTL,
        refresh_token,
        user:          UserResponse::from(user.clone()),
    })
}

/// Write a row to the audit_log table
async fn write_audit_log(
    state:         &AppState,
    action:        &str,
    actor_id:      Option<Uuid>,
    resource_type: &str,
    resource_id:   Option<Uuid>,
    metadata:      serde_json::Value,
) -> Result<(), AppError> {
    // Hash chain: in a full implementation, fetch last row_hash and chain it.
    // For simplicity, we use SHA-256 of (actor_id + action + timestamp).
    let prev_hash = "genesis"; // would be fetched from last audit row in production
    let chain_input = format!(
        "{}{}{}{}",
        prev_hash,
        action,
        actor_id.map(|u| u.to_string()).unwrap_or_default(),
        Utc::now().timestamp()
    );
    let row_hash = hex::encode(Sha256::digest(chain_input.as_bytes()));

    sqlx::query(
        r#"
        INSERT INTO audit_log (action, actor_id, resource_type, resource_id, metadata, row_hash)
        VALUES ($1::audit_action, $2, $3, $4, $5, $6)
        "#
    )
    .bind(action)
    .bind(actor_id)
    .bind(resource_type)
    .bind(resource_id)
    .bind(metadata)
    .bind(row_hash)
    .execute(&state.db)
    .await?;

    Ok(())
}

fn ensure_admin(claims: &Claims) -> Result<(), AppError> {
    if claims.role != "admin" {
        return Err(AppError::Unauthorized("Admin access required".into()));
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct UserSearchResponse {
    pub id: Uuid,
    pub email: String,
    pub full_name: String,
    pub student_id: Option<String>,
    pub department: Option<String>,
}

/// GET /api/users/search?q=...
pub async fn search_users(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Vec<UserSearchResponse>>, AppError> {
    ensure_admin(&claims)?;

    let search_term = format!("%{}%", params.q);

    let users = sqlx::query_as::<_, UserSearchResponse>(
        r#"
        SELECT id, email, full_name, student_id, department
        FROM users
        WHERE full_name ILIKE $1 OR email ILIKE $1 OR student_id ILIKE $1
        LIMIT 20
        "#
    )
    .bind(search_term)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(users))
}

#[derive(Deserialize)]
pub struct AdminListUsersQuery {
    pub q: Option<String>,
    pub role: Option<String>,
    pub is_active: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct AdminUserResponse {
    pub id: Uuid,
    pub email: String,
    pub full_name: String,
    pub student_id: Option<String>,
    pub department: Option<String>,
    pub role: String,
    pub is_active: bool,
    pub email_verified: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
pub struct UpdateUserStatusRequest {
    pub is_active: bool,
}

/// GET /api/admin/users
pub async fn admin_list_users(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<AdminListUsersQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    ensure_admin(&claims)?;

    let limit = params.limit.unwrap_or(20).clamp(1, 100);
    let offset = params.offset.unwrap_or(0).max(0);

    let role_filter = match params.role.as_deref() {
        Some("admin") => Some("admin"),
        Some("voter") => Some("voter"),
        Some(_) => return Err(AppError::Validation("role must be either 'admin' or 'voter'".into())),
        None => None,
    };

    let search_term = params
        .q
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{}%", s));

    let mut list_query = QueryBuilder::<Postgres>::new(
        "SELECT id, email, full_name, student_id, department, role::text as role, is_active, email_verified, created_at, updated_at FROM users",
    );

    let mut count_query = QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM users");

    let mut list_has_where = false;
    if let Some(search) = &search_term {
        let s = search.as_str();
        if !list_has_where {
            list_query.push(" WHERE ");
            list_has_where = true;
        } else {
            list_query.push(" AND ");
        }
        list_query
            .push("(full_name ILIKE ")
            .push_bind(s)
            .push(" OR email ILIKE ")
            .push_bind(s)
            .push(" OR COALESCE(student_id, '') ILIKE ")
            .push_bind(s)
            .push(")");
    }

    if let Some(role) = role_filter {
        if !list_has_where {
            list_query.push(" WHERE ");
            list_has_where = true;
        } else {
            list_query.push(" AND ");
        }
        list_query.push("role::text = ").push_bind(role);
    }

    if let Some(active) = params.is_active {
        if !list_has_where {
            list_query.push(" WHERE ");
            list_has_where = true;
        } else {
            list_query.push(" AND ");
        }
        list_query.push("is_active = ").push_bind(active);
    }

    let mut count_has_where = false;
    if let Some(search) = &search_term {
        let s = search.as_str();
        if !count_has_where {
            count_query.push(" WHERE ");
            count_has_where = true;
        } else {
            count_query.push(" AND ");
        }
        count_query
            .push("(full_name ILIKE ")
            .push_bind(s)
            .push(" OR email ILIKE ")
            .push_bind(s)
            .push(" OR COALESCE(student_id, '') ILIKE ")
            .push_bind(s)
            .push(")");
    }

    if let Some(role) = role_filter {
        if !count_has_where {
            count_query.push(" WHERE ");
            count_has_where = true;
        } else {
            count_query.push(" AND ");
        }
        count_query.push("role::text = ").push_bind(role);
    }

    if let Some(active) = params.is_active {
        if !count_has_where {
            count_query.push(" WHERE ");
            count_has_where = true;
        } else {
            count_query.push(" AND ");
        }
        count_query.push("is_active = ").push_bind(active);
    }

    list_query
        .push(" ORDER BY created_at DESC LIMIT ")
        .push_bind(limit)
        .push(" OFFSET ")
        .push_bind(offset);

    let users = list_query
        .build_query_as::<AdminUserResponse>()
        .fetch_all(&state.db)
        .await?;

    let total = count_query
        .build_query_scalar::<i64>()
        .fetch_one(&state.db)
        .await?;

    Ok(Json(serde_json::json!({
        "data": users,
        "total": total,
        "limit": limit,
        "offset": offset,
    })))
}

/// PATCH /api/admin/users/:id/status
pub async fn admin_update_user_status(
    State(state): State<Arc<AppState>>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<UpdateUserStatusRequest>,
) -> Result<Json<AdminUserResponse>, AppError> {
    ensure_admin(&claims)?;

    let actor_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::TokenInvalid)?;
    if actor_id == user_id && !req.is_active {
        return Err(AppError::Validation("You cannot deactivate your own admin account".into()));
    }

    let updated = sqlx::query_as::<_, AdminUserResponse>(
        r#"
        UPDATE users
        SET is_active = $1
        WHERE id = $2
        RETURNING id, email, full_name, student_id, department, role::text as role, is_active, email_verified, created_at, updated_at
        "#,
    )
    .bind(req.is_active)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::UserNotFound)?;

    write_audit_log(
        &state,
        "admin_action",
        Some(actor_id),
        "user",
        Some(user_id),
        serde_json::json!({ "is_active": req.is_active }),
    )
    .await?;

    Ok(Json(updated))
}
