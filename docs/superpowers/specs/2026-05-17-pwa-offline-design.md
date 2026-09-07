# Design Spec: PWA com Suporte Offline Avançado (Offline-First)

**Data:** 2026-05-17  
**Status:** Em Revisão  
**Autor:** Gemini CLI

## 1. Objetivo
Transformar o sistema "Comando" em um PWA (Progressive Web App) completo, permitindo que todas as funcionalidades (Notas, Tarefas, Projetos, etc.) funcionem sem conexão com a internet, com sincronização automática posterior.

## 2. Arquitetura Técnica

### 2.1 Camada de Dados (Frontend)
- **Tecnologia:** `Dexie.js` (Wrapper para IndexedDB).
- **Abordagem Local-First:** As Pinia Stores interagem primariamente com o Dexie.
- **Esquema:** O esquema do Dexie espelhará as tabelas do Drizzle no backend.
- **Tabela de Outbox:** Uma tabela especial `sync_queue` armazenará operações pendentes (`CREATE`, `UPDATE`, `DELETE`) realizadas offline.

### 2.2 Sincronização
- **Fluxo de Escrita:**
  1. Usuário realiza ação -> Grava no Dexie -> Adiciona à `sync_queue`.
  2. Sync Manager detecta conexão -> Processa `sync_queue` sequencialmente via API.
  3. Sucesso na API -> Remove da `sync_queue`.
- **Fluxo de Leitura:**
  1. App carrega dados do Dexie (instantâneo).
  2. Sync Manager busca novidades do servidor em segundo plano e atualiza o Dexie.

### 2.3 Service Worker (@vite-pwa/nuxt)
- **Estratégia de Cache:** `StaleWhileRevalidate` para assets estáticos.
- **Navegação Offline:** Fallback para `index.html` em rotas não cacheadas.
- **Manifesto:** Configuração de ícones, cor de tema e modo de exibição `standalone`.

## 3. Entidades Cobertas
Todas as entidades definidas no schema atual:
- `notes`, `tasks`, `projects`, `goals`, `people`, `companies`, `attachments`.

## 4. Considerações de Segurança e Conflitos
- **Conflitos:** Estratégia "Last Write Wins" baseada no campo `updated_at`.
- **Autenticação:** O Service Worker deve lidar com o estado do `better-auth` para evitar acesso a dados cacheados por usuários deslogados.

## 5. Plano de Implementação (Resumo)
1. Instalação de dependências (`@vite-pwa/nuxt`, `dexie`).
2. Configuração do `nuxt.config.ts` para PWA.
3. Criação da classe `Database` (Dexie) e inicialização dos schemas.
4. Refatoração de uma Store (ex: `notes`) para o padrão local-first como piloto.
5. Implementação do Sync Manager global.
