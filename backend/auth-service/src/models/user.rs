use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "user_role", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Student,
    Admin,
    Observer,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct User {
    pub id:             Uuid,
    pub email:          String,
    #[serde(skip_serializing)]  // Never expose password hash in API responses
    pub password_hash:  String,
    pub full_name:      String,
    pub student_id:     Option<String>,
    pub department:     Option<String>,
    pub role:           UserRole,
    pub is_active:      bool,
    pub email_verified: bool,
    pub created_at:     DateTime<Utc>,
    pub updated_at:     DateTime<Utc>,
}

/// Public-facing user representation (excludes sensitive fields)
#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id:         Uuid,
    pub email:      String,
    pub full_name:  String,
    pub student_id: Option<String>,
    pub department: Option<String>,
    pub role:       UserRole,
    pub created_at: DateTime<Utc>,
}

impl From<User> for UserResponse {
    fn from(u: User) -> Self {
        Self {
            id:         u.id,
            email:      u.email,
            full_name:  u.full_name,
            student_id: u.student_id,
            department: u.department,
            role:       u.role,
            created_at: u.created_at,
        }
    }
}

/// Request body for user registration
#[derive(Debug, Deserialize, Validate)]
pub struct RegisterRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email:      String,

    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password:   String,

    #[validate(length(min = 2, max = 100, message = "Full name is required"))]
    pub full_name:  String,

    pub student_id: Option<String>,
    pub department: Option<String>,
}

/// Request body for login
#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email)]
    pub email:    String,
    pub password: String,
}

/// Token pair returned on successful auth
#[derive(Debug, Serialize)]
pub struct TokenResponse {
    pub access_token:  String,
    pub token_type:    String,
    pub expires_in:    i64,
    pub refresh_token: String,
    pub user:          UserResponse,
}
