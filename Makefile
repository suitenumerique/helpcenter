
BOLD := \033[1m
RESET := \033[0m
GREEN := \033[1;32m

# -- Docker
# Get the current user ID to use for docker run and docker exec commands
COMPOSE             = docker compose
COMPOSE_RUN         = $(COMPOSE) run --build --rm

# ==============================================================================
# RULES

default: help


bootstrap: ## Prepare the project for local development
	@echo "$(BOLD)"
	@echo "╔══════════════════════════════════════════════════════════════════════════════╗"
	@echo "║                                                                              ║"
	@echo "║  🚀 Welcome to the Help Center - La Suite territoriale! 🚀                   ║"
	@echo "║                                                                              ║"
	@echo "║  This will set up your development environment with :                        ║"
	@echo "║  • Docker containers for all services                                        ║"
	@echo "║  • Database migrations and static files                                      ║"
	@echo "║  • Frontend dependencies and build                                           ║"
	@echo "║  • Environment configuration files                                           ║"
	@echo "║                                                                              ║"
	@echo "║  Services will be available at:                                              ║"
	@echo "║  • Frontend: http://localhost:8990                                           ║"
	@echo "║                                                                              ║"
	@echo "╚══════════════════════════════════════════════════════════════════════════════╝"
	@echo "$(RESET)"
	@echo "$(GREEN)Starting bootstrap process...$(RESET)"
	@echo ""
	@$(MAKE) update
	@$(MAKE) start
	@echo ""
	@echo "$(GREEN)🎉 Bootstrap completed successfully!$(RESET)"
	@echo ""
	@echo "$(BOLD)Next steps:$(RESET)"
	@echo "  • Visit http://localhost:8990 to access the website"
	@echo "  • Run 'make help' to see all available commands"
	@echo ""
.PHONY: bootstrap

update:  ## Update the project dependencies
update: \
	create-env-files \
	front-install-deps
.PHONY: update

create-env-files:  ## Create the environment configuration files
	touch .env.local
.PHONY: create-env-files

start:  ## Start the development environment
	$(COMPOSE) up -d --build frontend-dev
	@echo "$(GREEN)Frontend development environment started!$(RESET)"
	@echo "$(BOLD)Next steps:$(RESET)"
	@echo "  • Visit http://localhost:8990 to access the website"
	@echo "  • Run 'make help' to see all available commands"
	@echo ""
.PHONY: start

start-built:  ## Start the production-like environment
	$(COMPOSE) up -d --build frontend-built
.PHONY: start-built

stop:  ## Stop the development environment
	$(COMPOSE) stop
.PHONY: stop

logs:  ## Display all services logs (follow mode)
	@$(COMPOSE) logs -f
.PHONY: logs

restart:  ## Restart the development environment
	$(MAKE) stop
	$(MAKE) start
.PHONY: restart

reindex:  ## Reindex CMS content into Redis (dev env must be running)
	$(COMPOSE) exec frontend-dev npm run reindex
.PHONY: reindex

# ==============================================================================
# LINTING AND TESTING

lint:  ## Lint and format code
lint: \
	front-lint
.PHONY: lint

lint-check:  ## Check code linting without fixing
lint-check: \
	front-lint-check
.PHONY: lint-check


# ==============================================================================
# FRONTEND DEVELOPMENT

front-shell:  ## Open a shell in the frontend container
	$(COMPOSE_RUN) frontend-dev bash
.PHONY: front-shell

front-shell-production:  ## Open a shell in the frontend container with production DB
	$(COMPOSE_RUN) frontend-production bash
.PHONY: front-shell-production

front-install-deps:  ## Install the frontend dependencies with the lockfile
	$(COMPOSE_RUN) frontend-base npm ci
.PHONY: front-install-deps

front-freeze-deps:  ## Freeze the frontend dependencies
	rm -rf package-lock.json
	$(COMPOSE_RUN) frontend-base npm install
.PHONY: front-freeze-deps

front-freeze-deps-amd64:  ## Freeze the frontend dependencies
	rm -rf package-lock.json
	$(COMPOSE_RUN) frontend-base-amd64 npm install
.PHONY: front-freeze-deps-amd64

front-update-deps-check:  ## Check the frontend dependencies for updates
	$(COMPOSE_RUN) frontend-base npx npm-check-updates
	$(COMPOSE_RUN) frontend-base npm audit
.PHONY: front-update-deps-check

front-update-deps-minor:  ## Update the frontend dependencies to the minor version
	$(COMPOSE_RUN) frontend-base npx npm-check-updates -t minor -u
	@$(MAKE) front-freeze-deps
.PHONY: front-update-deps-minor

front-update-deps-latest:  ## Update the frontend dependencies to the major version
	$(COMPOSE_RUN) frontend-base npx npm-check-updates -t latest -u
	@$(MAKE) front-freeze-deps
.PHONY: front-update-deps-latest

front-lint:  ## Lint the frontend code
	$(COMPOSE_RUN) frontend-base npm run lint
.PHONY: front-lint

front-lint-check:  ## Check the frontend code linting without fixing
	$(COMPOSE_RUN) frontend-base npm run lint:check
.PHONY: front-lint-check

help:
	@echo "$(BOLD)Makefile help$(RESET)"
	@echo "Please use 'make $(BOLD)target$(RESET)' where $(BOLD)target$(RESET) is one of:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(firstword $(MAKEFILE_LIST)) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-30s$(RESET) %s\n", $$1, $$2}'
.PHONY: help
