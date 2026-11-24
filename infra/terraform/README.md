# Terraform stack (Docker provider)

Runs postgres, redis, the API and the worker on the local Docker daemon. No cloud, zero cost.
The app image is built from the root `Dockerfile`. Postgres is published on `127.0.0.1:${postgres_host_port}`:
run `npm run db:migrate` and `npm run seed` from the host with a matching `DATABASE_URL`.

```sh
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # fill in the secrets
terraform init
terraform plan
terraform apply
```

`terraform output api_url` prints the API URL. Remove everything with `terraform destroy`.
State and `*.tfvars` are git-ignored; they contain secrets.

## Without a local Terraform install

Use the pinned Docker image (from the repo root, Git Bash on Windows needs `MSYS_NO_PATHCONV=1`):

```sh
docker run --rm -v "$(pwd -W)":/work -w /work/infra/terraform hashicorp/terraform:1.17.2 validate
```

For `plan`/`apply` also mount the daemon socket (`-v //var/run/docker.sock:/var/run/docker.sock`) and pass the `TF_VAR_*` secrets with `-e`.
