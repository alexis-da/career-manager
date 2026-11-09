# Restaurer la base de production (Neon)

Procédure rédigée le 09/11/2026 d'après la documentation de Neon (offre Launch : « Backup & restore », « Instant
restore », pages relues ce jour-là). Tout se fait dans la console Neon et dans les réglages de Vercel : **aucune donnée ne
sort de Neon**, et le poste local ne se connecte jamais à la base de production (règle « Bases de données » de
`CLAUDE.md`).

## Ce qui protège les données

- **L'historique de la branche (instant restore)** : Neon garde chaque changement pendant la fenêtre d'historique du
  projet (Launch : 1 jour par défaut, 7 jours au plus, réglable dans les réglages du projet, « History window »).
  On peut revenir à n'importe quelle seconde de cette fenêtre. C'est le premier recours pour un incident récent : on y
  perd le moins de parties.
- **Un instantané par semaine (snapshot)** : programmé dans la console (ci-dessous), gardé 4 semaines. C'est le recours
  pour un incident découvert après la fenêtre d'historique.

Une restauration ramène toute la base au moment choisi : ce que les joueurs ont fait depuis est perdu.

## Programmer l'instantané hebdomadaire (une fois)

1. Console Neon → le projet de production → **Backup & restore**. Si la page n'a pas d'instantanés, activer
   **Enhanced view** sur cette page.
2. Choisir la branche de production. Le programme est réglé par branche, et seulement sur une branche racine.
3. **Edit schedule** → fréquence **Weekly** → lundi (jour 1), 6 h. Le défi est créé à 5 h UTC (`challenge.yml`), et
   l'heure est probablement en UTC : la documentation ne le dit que pour l'API.
4. Conservation : **4 semaines** (28 jours). Chaque lundi, l'instantané d'il y a quatre semaines expire quand le nouveau
   arrive : il en reste 4. D'après la documentation, la conservation se règle en modifiant le programme, mais elle ne
   détaille pas le champ. Sans réglage, la conservation est de 35 jours, la valeur maximale : il en reste alors 5.
5. **Update schedule**. Le lundi suivant, le premier instantané apparaît dans la liste de la page.

Si la console ne proposait pas 4 semaines, garder 35 jours, ou régler la durée une fois par l'API de gestion de Neon,
qui règle le programme sans toucher aux données : `PUT https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}/backup_schedule`, en-tête
`Authorization: Bearer <clé>`, corps
`{"schedule":[{"frequency":"weekly","day":1,"hour":6,"retention_seconds":2419200}]}`. La clé la plus restreinte est une
clé limitée au projet : réglages de l'organisation → API keys → Create new → Project-scoped. Elle n'est affichée qu'une
fois ; la supprimer après usage.

Avant une opération risquée (grosse migration, nettoyage), on peut aussi prendre un instantané à la main : bouton
**Create snapshot** de la même page (100 au plus sur Launch).

**Coût** : 0,09 $ par Go et par mois de stockage d'instantané. Le premier instantané programmé compte la taille de la
base, les suivants seulement ce qui a changé depuis le précédent. Pour une base de 1 Go, quatre instantanés coûtent au
plus 0,36 $ par mois, et plutôt 0,10 à 0,15 $.

## 1. Restaurer sur une nouvelle branche, pour vérifier

### Depuis un instantané (« Multi-step restore »)

1. **Backup & restore** → l'instantané voulu → **Restore** → **Multi-step restore** → **Restore**. Neon crée une
   nouvelle branche avec les données de l'instantané. La branche de production ne change pas, le jeu continue de
   tourner dessus.
2. La console ouvre la page de la nouvelle branche.

### Depuis l'historique (« instant restore »)

- Pour regarder sans rien changer : branche de production → **Backup & Restore** → **Restore from history** → l'heure
  voulue → **Preview data**. On peut y parcourir les tables, lancer des requêtes en lecture seule et comparer les
  schémas, à cette heure-là.
- Pour une vraie branche à vérifier : **Branches** → **Create branch** depuis la branche de production, à un instant
  passé de la fenêtre d'historique. On la vérifie comme ci-dessous, puis on bascule comme au 2.

### Vérifier

Dans le **SQL Editor** de la console, la nouvelle branche choisie :

```sql
SELECT count(*) AS parties FROM "Save";
SELECT count(*) AS joueurs, max("lastSeenAt") AS derniere_visite FROM "User";
SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 3;
SELECT pg_size_pretty(pg_database_size(current_database())) AS taille;
```

Le nombre de parties doit être plausible et la dernière visite juste avant le moment choisi. Comparer la dernière
migration à celle de `prisma/migrations`.

## 2. Basculer la production dessus

### Sans toucher à Vercel (recommandé)

Sur la page de la branche restaurée : **Migrate connections and settings**. Neon déplace le calcul de la branche de
production vers la branche restaurée. **Les adresses de connexion ne changent pas** : `DATABASE_URL` et `DIRECT_URL`
restent bonnes sur Vercel. L'ancienne branche reste dans le projet, renommée « (old) », pour comparer ou revenir en
arrière. Les connexions sont coupées quelques secondes.

### En pointant Vercel sur la nouvelle branche

Seulement si l'on veut garder la branche de production telle quelle.

1. Vercel → le projet → **Settings** → **Environment Variables**, environnement **Production** seulement : remplacer
   `DATABASE_URL` par l'adresse **poolée** de la nouvelle branche (Neon : **Connect**, « Connection pooling »
   activé), et `DIRECT_URL` par son adresse **directe** (pooling désactivé). Ne rien ajouter à Preview ni à
   Development, qui n'ont aucune variable de base.
2. Garder les anciennes valeurs dans ton gestionnaire de mots de passe, jamais dans un fichier du dépôt, pour revenir en
   arrière.
3. **Redéployer** la production (Deployments → le dernier déploiement de production → ⋯ → Redeploy) : une variable
   changée ne vaut que pour un nouveau déploiement.

### Dans les deux cas : les migrations

Si l'instantané est plus ancien que la dernière migration du dépôt, la base restaurée n'a pas le schéma que le code
attend. **Redéployer la production** : le build lance `prisma migrate deploy` (`npm run build`), qui applique les
migrations manquantes. Elles sont d'ajout seulement, sans risque pour les données restaurées. Puis ouvrir le jeu,
`/admin` (sections Santé et Erreurs), une partie et un match.

### Pendant l'opération

La maintenance quotidienne (`maintenance.yml`, 04:17 UTC) agit sur la production. Pour une restauration qui dure, la
mettre en pause : GitHub → Actions → Maintenance → ⋯ → **Disable workflow**. La réactiver ensuite.

## Durées estimées

| Étape | Durée |
| --- | --- |
| Créer la branche restaurée (instantané ou historique) | quelques secondes à quelques minutes : Neon part des données qu'il garde, sans copie |
| Vérifier dans le SQL Editor | 10 à 20 minutes |
| Basculer par « Migrate connections and settings » | environ une minute, connexions coupées quelques secondes |
| Ou basculer par Vercel (variables, puis redéploiement) | 5 à 10 minutes, dont le build |
| Redéployer pour les migrations, si besoin | 3 à 5 minutes |
| **Total** | **20 à 40 minutes**, surtout de la vérification |
