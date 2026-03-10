import re
import os
import psycopg2
import psycopg2.extras
from collections import defaultdict
from datetime import datetime, timezone
from urllib.parse import urlparse

db_url = os.environ.get("BACKUP_DATABASE_URL") or os.environ.get("DATABASE_URL")
if not db_url:
    raise RuntimeError("No database URL found in BACKUP_DATABASE_URL or DATABASE_URL")

parsed = urlparse(db_url)

def normalize_subject(subject):
    if not subject:
        return ""
    s = subject
    s = re.sub(r"^(re|fwd|fw|forward):\s*", "", s, flags=re.IGNORECASE)
    s = s.replace("[Omitted]", "__NAME__")
    s = re.sub(r"\b[A-Z][a-z]{1,20}\b(?=\s*[,!?:])", "__NAME__", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s

def main():
    conn = psycopg2.connect(
        host=parsed.hostname,
        port=parsed.port or 5432,
        user=parsed.username,
        password=parsed.password,
        dbname=parsed.path.lstrip("/"),
        sslmode="require"
    )
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print("Fetching all non-deleted campaigns...")
    cur.execute("""
        SELECT id, "senderEmail", subject, "dateReceived",
               "inboxCount", "spamCount", "notDeliveredCount", "inboxRate",
               "emailPreview", "emailContent", "entityId", "assignmentMethod", "clientId"
        FROM "CompetitiveInsightCampaign"
        WHERE "isDeleted" = false
        ORDER BY "senderEmail", "dateReceived"
    """)
    campaigns = [dict(r) for r in cur.fetchall()]
    print("Loaded " + str(len(campaigns)) + " campaigns. Grouping by sender + day...")

    groups = defaultdict(list)
    for c in campaigns:
        day = c["dateReceived"].strftime("%Y-%m-%d") if c["dateReceived"] else "unknown"
        key = c["senderEmail"] + "|" + day
        groups[key].append(c)

    merged_count = 0
    deleted_count = 0

    for group_key, group_campaigns in groups.items():
        if len(group_campaigns) < 2:
            continue

        assigned = set()
        clusters = []

        for c in group_campaigns:
            if c["id"] in assigned:
                continue
            norm_c = normalize_subject(c["subject"])
            cluster = [c]
            assigned.add(c["id"])

            for other in group_campaigns:
                if other["id"] in assigned:
                    continue
                if normalize_subject(other["subject"]) == norm_c:
                    cluster.append(other)
                    assigned.add(other["id"])

            if len(cluster) > 1:
                clusters.append(cluster)

        for cluster in clusters:
            omitted = [c for c in cluster if c["subject"] and "[Omitted]" in c["subject"]]
            if omitted:
                canonical = omitted[0]
            else:
                canonical = sorted(
                    cluster,
                    key=lambda c: c["dateReceived"] or datetime.min.replace(tzinfo=timezone.utc),
                    reverse=True,
                )[0]

            dupes = [c for c in cluster if c["id"] != canonical["id"]]
            total_inbox = sum(c["inboxCount"] or 0 for c in cluster)
            total_spam = sum(c["spamCount"] or 0 for c in cluster)
            total_not_delivered = sum(c["notDeliveredCount"] or 0 for c in cluster)
            total_count = total_inbox + total_spam + total_not_delivered
            new_inbox_rate = (total_inbox / total_count * 100.0) if total_count > 0 else 0.0

            best_preview = canonical["emailPreview"] or next((d["emailPreview"] for d in dupes if d["emailPreview"]), None)
            best_content = canonical["emailContent"] or next((d["emailContent"] for d in dupes if d["emailContent"]), None)
            best_entity = canonical["entityId"] or next((d["entityId"] for d in dupes if d["entityId"]), None)
            best_assignment = canonical["assignmentMethod"] or next((d["assignmentMethod"] for d in dupes if d["assignmentMethod"]), None)
            best_client = canonical["clientId"] or next((d["clientId"] for d in dupes if d["clientId"]), None)

            dupe_ids = [d["id"] for d in dupes]
            print("Merging " + str(len(cluster)) + " dupes [" + group_key + "]: keeping " + canonical["id"] + ", soft-deleting " + str(dupe_ids))

            cur.execute("""
                UPDATE "CompetitiveInsightCampaign"
                SET "inboxCount" = %s, "spamCount" = %s, "notDeliveredCount" = %s,
                    "inboxRate" = %s, "emailPreview" = %s, "emailContent" = %s,
                    "entityId" = %s, "assignmentMethod" = %s, "clientId" = %s,
                    "updatedAt" = NOW()
                WHERE id = %s
            """, (total_inbox, total_spam, total_not_delivered, new_inbox_rate,
                  best_preview, best_content, best_entity, best_assignment,
                  best_client, canonical["id"]))
            merged_count += 1

            for dupe in dupes:
                cur.execute("""
                    UPDATE "CompetitiveInsightCampaign"
                    SET "isDeleted" = true, "updatedAt" = NOW()
                    WHERE id = %s
                """, (dupe["id"],))
                deleted_count += 1

    conn.commit()
    cur.close()
    conn.close()
    print("Done. Merged " + str(merged_count) + " canonical campaigns, soft-deleted " + str(deleted_count) + " duplicates.")

main()
