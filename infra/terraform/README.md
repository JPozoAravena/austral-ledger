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
