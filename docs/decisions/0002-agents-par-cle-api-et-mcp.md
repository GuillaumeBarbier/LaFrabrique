# ADR-0002 : Les agents se connectent par clé API, à la même API que l'interface, et par MCP

## Contexte

La demande : « l'agent IA peut se connecter grâce à une clé API que l'humain configure dans une section Paramètres ». L'agent le plus probable est Claude (Claude Code, Claude Desktop, Cowork), qui sait parler MCP ; d'autres agents ou scripts parleront HTTP.

## Décision

1. **Clés générées par La Fabrique** dans Paramètres › Agents IA : nom (affiché comme auteur des modifications), portée `read` ou `write`. Format `lfab_` + 40 caractères aléatoires ; montrée **une seule fois** ; stockée hachée (SHA-256) ; révocable ; date de dernière utilisation affichée.
2. **Une seule API, `/api/v1`**, appelée par l'interface (cookie de session) **et** par les agents (`Authorization: Bearer lfab_…`). Ce que l'humain peut faire, l'agent peut le faire, sauf :
   - supprimer un livre, gérer les clés, téléverser ou supprimer une police perso : **humain seulement** ;
   - tout le reste (créer un livre, écrire, illustrer, changer le statut, commenter, restaurer) : portée `write`.
3. **Serveur MCP** sur `/api/mcp` (HTTP « streamable », sans état), mêmes règles d'accès. Ses outils appellent les mêmes fonctions que les routes REST. Ses **consignes** (`instructions`) disent à l'agent comment travailler : lire le brief, traiter les demandes ouvertes, laisser un mot à chaque passage.
4. **Chaque modification est attribuée** (type `human` ou `agent`, nom) et historisée ; tout est restaurable (F1.8).
5. Les **clés des fournisseurs d'IA** (génération d'images, de texte dans l'app) sont un autre sujet, en phase 3, stockées chiffrées.

## Conséquences

- La parité est garantie par construction : une fonction absente de l'API est absente de l'interface.
- claude.ai (web, mobile) ne sait pas envoyer d'en-tête pour un connecteur personnalisé : il faudra un OAuth minimal pour ce cas (F2.8). Claude Code et Claude Desktop (fichier de configuration) fonctionnent dès maintenant.

## Statut

Accepté le 03/10/2026.
