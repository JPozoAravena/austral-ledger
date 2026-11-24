variable "docker_host" {
  description = "Docker daemon endpoint (null uses the provider default, DOCKER_HOST or the local socket)."
  type        = string
  default     = null
}

variable "api_host_port" {
  description = "Host port where the API is published."
  type        = number
  default     = 3000

  validation {
    condition     = var.api_host_port >= 1 && var.api_host_port <= 65535
    error_message = "api_host_port must be between 1 and 65535."
  }
}

variable "postgres_host_port" {
  description = "Loopback host port for PostgreSQL, used to run migrations from the host."
  type        = number
  default     = 5432

  validation {
    condition     = var.postgres_host_port >= 1 && var.postgres_host_port <= 65535
    error_message = "postgres_host_port must be between 1 and 65535."
  }
}

variable "postgres_user" {
  description = "PostgreSQL user."
  type        = string
  default     = "austral"
}

variable "postgres_db" {
  description = "PostgreSQL database name."
  type        = string
  default     = "austral_ledger"
}

variable "postgres_password" {
  description = "PostgreSQL password."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.postgres_password) >= 16
    error_message = "postgres_password must be at least 16 characters."
  }
}

variable "api_key_pepper" {
  description = "Secret mixed into the API key HMAC (at least 32 characters). Losing it invalidates every issued key."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.api_key_pepper) >= 32
    error_message = "api_key_pepper must be at least 32 characters."
  }
}

variable "webhook_secret_key" {
  description = "AES-256 key (32 bytes, base64) that encrypts webhook secrets at rest."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[A-Za-z0-9+/]{43}=$", var.webhook_secret_key))
    error_message = "webhook_secret_key must be 32 bytes encoded as base64."
  }
}

variable "app_source_path" {
  description = "Directory with the Dockerfile used to build the API image."
  type        = string
  default     = "../.."
}
