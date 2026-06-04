# General AI Coding Instructions & Constraints

## 1. Code Preservation & Safety (CRITICAL)
- **NEVER delete, overwrite, or refactor existing code** unless explicitly instructed to do so.
- Always assume existing modules (`Employees`, `Notifications`, `Digital Signatures`, `PHVA`, etc.) are working perfectly. Your job is to **extend**, not to replace.
- If you need to reference an existing module, import it properly. Do not duplicate its logic.

## 2. DRY Principle & Code Efficiency
- **Do not reinvent the wheel.** Reuse existing services, decorators, guards, and utilities already present in the codebase.
- Avoid verbose or redundant code. Keep functions specialized, clean, and production-ready.
- When generating CRUD operations, use inheritance or existing helper classes if the project already implements them.

## 3. NestJS & MongoDB/Mongoose Architecture Guidelines
- Strict adherence to NestJS modular architecture. Every new feature must be encapsulated in its own module (e.g., `src/modules/annual-work-plan/...`).
- **Schemas:** Define Mongoose schemas using standard NestJS `@Schema()`, `@Prop()`, and `HydratedDocument` decorators. Always use appropriate Enums for status and priority fields.
- **Dependency Injection:** Inject repositories and services using native NestJS constructor injection (`@InjectModel()`, etc.).
- **Security & Roles:** Use the existing authentication guards and `@Roles()` decorators for role-based access control (`OWNER`, `MANAGER`, `ADMIN`, `MEMBER`).

## 4. Context Awareness
- Before writing any line of code, scan the `@workspace` to understand the naming conventions (camelCase, PascalCase), folder structure, and error-handling patterns used in this repository.
- Match the existing testing pattern (Jest) when creating new test files.