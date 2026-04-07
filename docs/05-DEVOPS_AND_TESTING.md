# DevOps, Containerization & Testing

## 1. Docker Architecture
This branch assumes a Directus-first stack.

### Services Required
1. **`db`**: PostgreSQL 15
2. **`directus`**: Directus application server
3. **`frontend`**: custom React application
4. **`automation`** or **`config-service`**: optional companion service for config generation and advanced integrations

Redis is optional unless the selected companion services require it.

## 2. Environment Strategy
Local and production-like environments should both use containerized services.

Required environment concerns:
* Directus secret and admin bootstrap configuration
* PostgreSQL credentials
* Plane API credentials
* email or notification settings
* storage configuration for generated artifacts

## 3. Testing Strategy
* **Schema and integration tests**: verify Directus collections, relations, permissions, and flows behave as expected
* **Frontend tests**: verify upload UX, explorer views, auth flows, and config-generation interactions
* **E2E tests**: run the full Directus plus frontend stack and exercise the intake workflow end to end

## 4. CI Expectations
The CI workflow for this branch should eventually include:
1. frontend lint and unit tests
2. Directus configuration validation or smoke tests
3. integration tests for custom endpoints or extensions
4. E2E tests against the containerized stack

## 5. Deployment Principle
Avoid rebuilding a large custom backend before proving that Directus collections, permissions, flows, and a small number of extensions are insufficient.
