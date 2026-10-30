# {{project_name}} — Project Agents

## Stack

- **Backend**: {{backend_stack}}
- **Frontend**: {{frontend_stack}}  
- **Database**: {{database_stack}}
- **Language**: {{language}}

## Repos

```
{{repo_dir_api}}/    # Backend
{{repo_dir_app}}/    # Frontend (if applicable)
```

> O diretório `projects/{{project_slug}}/` contém apenas meta-informação:
> knowledge, agents e AGENTS.md específicos do projeto.

## Development

### Backend

```bash
{{backend_dev_commands}}
```

### Frontend

```bash
{{frontend_dev_commands}}
```

### Database

```bash
{{database_commands}}
```

## Architecture

See `knowledge/specs/` for architecture details.

{{architecture_notes}}

## Important Conventions

{{conventions}}

## Agents

Os agentes específicos do {{project_name}} estão em `agents/`:

| Agente | Arquivo | Função |
|--------|---------|--------|
| {{agent_name}} | `agents/{{agent_file}}` | {{agent_role}} |

Registrados no `opencode.json` da raiz via campo `agents` com `prompt`
apontando para estes arquivos.

## Vault (opcional)

Se este projeto tiver vault configurado em `.opencode/config/project-mapping.json`
(campo `vault`), consulte `projects/<slug>/obsidian-vault/` para documentação
detalhada de domínios, fluxos e regras de negócio.
