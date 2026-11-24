locals {
  database_url = "postgresql://${var.postgres_user}:${var.postgres_password}@postgres:5432/${var.postgres_db}"
  redis_url    = "redis://redis:6379"
  app_env = [
    "NODE_ENV=production",
    "DATABASE_URL=${local.database_url}",
    "REDIS_URL=${local.redis_url}",
    "API_KEY_PEPPER=${var.api_key_pepper}",
    "WEBHOOK_SECRET_KEY=${var.webhook_secret_key}",
  ]
}

resource "docker_network" "ledger" {
  name = "austral-ledger"
}

resource "docker_volume" "postgres_data" {
  name = "austral-ledger-postgres"
}

resource "docker_image" "postgres" {
  name = "postgres:18.7-alpine"
}

resource "docker_image" "redis" {
  name = "redis:8.8.4-alpine"
}

resource "docker_image" "app" {
  name = "austral-ledger:local"

  build {
    context = var.app_source_path
  }

  triggers = {
    dockerfile = filesha256("${var.app_source_path}/Dockerfile")
    lockfile   = filesha256("${var.app_source_path}/package-lock.json")
    sources    = sha256(join("", [for f in sort(fileset("${var.app_source_path}/src", "**")) : filesha256("${var.app_source_path}/src/${f}")]))
  }
}

resource "docker_container" "postgres" {
  name    = "austral-ledger-postgres"
  image   = docker_image.postgres.image_id
  restart = "unless-stopped"

  env = [
    "POSTGRES_USER=${var.postgres_user}",
    "POSTGRES_PASSWORD=${var.postgres_password}",
    "POSTGRES_DB=${var.postgres_db}",
  ]

  ports {
    internal = 5432
    external = var.postgres_host_port
    ip       = "127.0.0.1"
  }

  networks_advanced {
    name    = docker_network.ledger.name
    aliases = ["postgres"]
  }

  volumes {
    volume_name    = docker_volume.postgres_data.name
    container_path = "/var/lib/postgresql"
  }

  healthcheck {
    test     = ["CMD-SHELL", "pg_isready -U ${var.postgres_user} -d ${var.postgres_db}"]
    interval = "5s"
    timeout  = "3s"
    retries  = 10
  }
}

resource "docker_container" "redis" {
  name    = "austral-ledger-redis"
  image   = docker_image.redis.image_id
  restart = "unless-stopped"

  networks_advanced {
    name    = docker_network.ledger.name
    aliases = ["redis"]
  }

  healthcheck {
    test     = ["CMD", "redis-cli", "ping"]
    interval = "5s"
    timeout  = "3s"
    retries  = 10
  }
}

resource "docker_container" "api" {
  name    = "austral-ledger-api"
  image   = docker_image.app.image_id
  restart = "unless-stopped"
  env     = concat(local.app_env, ["PORT=3000"])

  ports {
    internal = 3000
    external = var.api_host_port
  }

  networks_advanced {
    name    = docker_network.ledger.name
    aliases = ["api"]
  }

  healthcheck {
    test         = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/health || exit 1"]
    interval     = "10s"
    timeout      = "3s"
    retries      = 5
    start_period = "10s"
  }

  depends_on = [docker_container.postgres, docker_container.redis]
}

resource "docker_container" "worker" {
  name    = "austral-ledger-worker"
  image   = docker_image.app.image_id
  restart = "unless-stopped"
  command = ["node", "dist/worker.js"]
  env     = local.app_env

  networks_advanced {
    name    = docker_network.ledger.name
    aliases = ["worker"]
  }

  healthcheck {
    test     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:9464/metrics > /dev/null"]
    interval = "10s"
    timeout  = "3s"
    retries  = 5
  }

  depends_on = [docker_container.postgres, docker_container.redis]
}
