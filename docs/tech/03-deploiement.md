# Déploiement

> Une image (`ghcr.io/guillaumebarbier/lafabrique`), un dossier de données (`/data`), un nom : `lafabrique.guillaume-barbier.com`. Même chaîne que les autres projets de Guillaume : push sur `main` → GitHub Actions → GHCR → Watchtower. Le choix du serveur est à faire ([`03-actions-guillaume.md`](../03-actions-guillaume.md)).

## 1. Ce qui est prêt dans le dépôt

| Fichier | Rôle |
|---|---|
| [`Dockerfile`](../../Dockerfile) | Image `node:22-slim` (pas alpine : binaires natifs glibc), utilisateur 1001, volume `/data`, contrôle de santé `/api/health` |
| [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | Typage, lint, tests, build à chaque push |
| [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml) | Image `latest` + `sha-…` sur GHCR à chaque push sur `main` (amd64) |
| [`deploy/vps/docker-compose.yml`](../../deploy/vps/docker-compose.yml) | VPS derrière le Traefik partagé |
| [`deploy/nas/deploy-lafabrique.sh`](../../deploy/nas/deploy-lafabrique.sh) | Tâche DSM (root) pour le NAS Synology |

Image testée le 03/10/2026 : construction, premier compte avec `SETUP_TOKEN`, base et illustrations écrites dans le volume par l'utilisateur 1001, `sharp` et SQLite opérationnels.

## 2. Variables

| Variable | Défaut | Rôle |
|---|---|---|
| `DATA_DIR` | `/data` | Base SQLite, illustrations, polices |
| `APP_URL` | déduite de la requête | **Obligatoire en production** : adresse publique exacte. Sert d'émetteur OAuth et de ressource MCP (le connecteur claude.ai échoue si elle ne correspond pas à l'URL saisie), et figure dans les instructions de connexion |
| `SETUP_TOKEN` | vide | Si posé, exigé pour créer le premier compte. À vider une fois le compte créé |
| `PORT` | `3000` | Port d'écoute dans le conteneur |

## 3. Option NAS (comme To Do Love)

`guillaume-barbier.com` sert déjà `todo.guillaume-barbier.com` depuis le NAS : même recette (skill « nas-auto-deploy » de Guillaume).

1. **GHCR** : après le premier build vert, passer le paquet `lafabrique` en **Public** (GitHub › Packages › lafabrique › Package settings › Danger Zone). Le code reste privé ; l'image ne contient aucun secret.
2. **Tâche DSM** : Panneau de configuration › Planificateur de tâches › Créer › Tâche planifiée › Script défini par l'utilisateur ; utilisateur **root** ; « ne pas répéter » ; coller [`deploy/nas/deploy-lafabrique.sh`](../../deploy/nas/deploy-lafabrique.sh) ; **Exécuter**.
   - ⚠️ Le script recrée Watchtower avec la liste `to-do-love lafabrique`. Vérifier d'abord la liste actuelle (`docker inspect watchtower --format '{{.Args}}'`) et garder toutes les applis déjà surveillées.
   - Port local : **3020** (3000 est pris par To Do Love).
3. **DNS** : `A` (ou `CNAME`) `lafabrique` → IP publique de la maison, comme `todo`.
4. **Certificat** : Panneau de configuration › Sécurité › Certificat : Let's Encrypt pour `lafabrique.guillaume-barbier.com` (ou le joker existant).
5. **Proxy inversé** : Portail de connexion › Avancé › Proxy inversé › Créer : source `HTTPS` `lafabrique.guillaume-barbier.com` `443` → destination `HTTP` **`127.0.0.1`** (pas `localhost` : IPv6) `3020`.
   - Le direct (SSE) traverse le nginx de DSM grâce à l'en-tête `X-Accel-Buffering: no` envoyé par l'app ; un battement part toutes les 25 s pour rester sous le délai de 60 s.
   - Si un gros téléversement échoue en 413 : la limite de taille du nginx DSM est en cause, à relever.
6. **Sauvegarde** : ajouter `/volume1/docker/lafabrique` à Hyper Backup (en attendant les copies à chaud de F2.3, la base WAL est cohérente si la sauvegarde tourne la nuit, sans écriture en cours).
7. **Premier lancement** : ouvrir l'adresse et créer le compte tout de suite.

## 4. Option VPS (KVM4, à côté de Pro-Resa)

Traefik partagé dans `/opt/traefik` (résolveur `le`, redirection http → https globale), réseau `root_default`, Watchtower global par label, serveur déjà authentifié sur GHCR ([état du KVM4](https://github.com/GuillaumeBarbier/pro-resa/blob/main/docs/03-tech/03-etat-serveur-kvm4.md)).

```bash
mkdir -p /opt/lafabrique && cd /opt/lafabrique
# Le dépôt est privé : coller le contenu de deploy/vps/docker-compose.yml
cat > docker-compose.yml <<'EOF'
…contenu de deploy/vps/docker-compose.yml…
EOF
printf 'CERT_RESOLVER=le\nSETUP_TOKEN=%s\n' "$(openssl rand -hex 12)" > .env && cat .env
docker compose pull && docker compose up -d && docker compose logs --tail 20
```

Sur l'autre VPS (69.62.109.49, designer-tools) : `CERT_RESOLVER=mytlschallenge` et décommenter les trois lignes du routeur `lafabrique-http` (pas de redirection globale là-bas).

Rappels de l'expérience Pro-Resa : Watchtower ne relit **pas** le compose ; après toute modification du fichier ou du `.env`, lancer `docker compose up -d`. Le premier accès https prend 10 à 15 s (certificat).

Sauvegarde : volume Docker `lafabrique-data`. En attendant F2.3 : `docker compose stop && docker run --rm -v lafabrique_lafabrique-data:/data -v /opt/lafabrique/backups:/b debian tar czf /b/lafabrique-$(date +%F).tgz -C /data . && docker compose start`.

## 5. Mise à jour

Rien à faire : un push sur `main` reconstruit l'image, Watchtower la tire sous 5 minutes. Les migrations de base sont jouées au démarrage du conteneur.

Si les minutes GitHub Actions du compte sont épuisées (déjà arrivé sur Pro-Resa) : `runs-on: [self-hosted, kvm4]` dans les deux workflows, après avoir enregistré le runner du KVM4 pour ce dépôt.

## 6. Développement local

```bash
pnpm install && pnpm dev     # http://localhost:3000, données dans ./data
```
