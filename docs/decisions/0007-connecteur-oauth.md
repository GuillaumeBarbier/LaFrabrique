# ADR-0007 : OAuth pour brancher La Fabrique comme connecteur Claude

## Contexte

Les clés API ([ADR-0002](0002-agents-par-cle-api-et-mcp.md)) suffisent pour Claude Code et les scripts, mais claude.ai (web, Desktop, mobile, Cowork) n'ajoute un connecteur personnalisé qu'avec OAuth (ou sans authentification). Le 03/10/2026, Guillaume demande le connecteur OAuth. Exigences de Claude ([documentation](https://claude.com/docs/connectors/building/authentication.md), spécification MCP 2025-11-25) : 401 avec `resource_metadata`, métadonnées RFC 9728 et RFC 8414, CIMD ou enregistrement dynamique, PKCE S256, `resource` (RFC 8707), retour `https://claude.ai/api/mcp/auth_callback` ou boucle locale de Claude Code sur n'importe quel port, rotation des jetons de rafraîchissement, `invalid_grant` quand un jeton n'est plus valable.

## Décision

1. **La Fabrique est son propre serveur d'autorisation** (OAuth 2.1, code d'autorisation + PKCE S256), sans dépendance externe. L'émetteur est l'origine publique (`APP_URL`), la ressource protégée est exactement `https://lafabrique.guillaume-barbier.com/api/mcp`.
2. **Découverte** : un 401 sur `/api/mcp` porte `WWW-Authenticate: Bearer resource_metadata=…, scope="read write"` ; `/.well-known/oauth-protected-resource[/api/mcp]` et `/.well-known/oauth-authorization-server` sont servis par des routes (réécritures Next).
3. **Clients** : par **document de métadonnées (CIMD)** — ce que Claude préfère quand le serveur l'annonce — ou par **enregistrement dynamique** (RFC 7591) en repli. Adresses de retour : correspondance exacte, sauf les adresses locales `http://localhost` / `127.0.0.1` dont le port varie. Un client seul ne peut rien : il faut la connexion de Guillaume et son accord.
4. **Consentement** : page `/oauth/autoriser` (connexion d'abord si besoin) qui montre le client et l'hôte de retour, avertit pour une application locale, et fait **choisir le nom de l'agent et sa portée** (lecture et écriture, ou lecture seule). Chaque accord crée une **connexion** = un agent, comme une clé.
5. **Jetons opaques**, stockés hachés : accès `lfat_…` (1 h), rafraîchissement `lfrt_…` (60 jours, **à usage unique** : un rejeu révoque la connexion), code (10 min, usage unique : un rejeu révoque ce qu'il a produit). Les jetons OAuth n'ouvrent **que** `/api/mcp` (audience) ; l'API REST reste aux clés.
6. **Gestion** : Paramètres › Agents IA › « Connexions OAuth » (nom, client, hôte, portée, dernière utilisation, révoquer). Révocation RFC 7009 aussi pour les clients.

## Conséquences

- claude.ai, Claude Desktop (Connecteurs), le mobile et Claude Code (`claude mcp add --transport http …` sans en-tête, puis `/mcp`) se branchent sans clé à copier.
- `APP_URL` devient indispensable en production : l'émetteur et la ressource doivent être l'adresse publique exacte.
- Le serveur doit pouvoir joindre `https://claude.ai/…` (document CIMD) ; redirections refusées.
- L'enregistrement dynamique crée un client par nouvelle connexion : ceux jamais utilisés sont effacés après 30 jours.

## Statut

Accepté le 03/10/2026.
