import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BUG_REPORT_ENTITY_TYPES,
  BUG_REPORT_STATUSES,
  canTransitionBugReportStatus,
  isBugReportEntityType,
  isBugReportStatus,
} from "../src/lib/bug-reports/model";
import {
  getExternalNotificationRoute,
  parseExternalNotificationRouteForm,
} from "../src/lib/notifications/routes";
import {
  getNotificationHref,
  getNotificationRecipientType,
  getNotificationTitle,
} from "../src/lib/notifications/catalog";

const migration = readFileSync("drizzle/0077_bug_reports.sql", "utf8");
const journal = readFileSync("drizzle/meta/_journal.json", "utf8");
const schema = readFileSync("src/db/schema.ts", "utf8");
const api = readFileSync("src/app/api/bug-reports/route.ts", "utf8");
const query = readFileSync("src/db/queries/bug-reports.ts", "utf8");
const domainCatalog = readFileSync("src/lib/domain-events/catalog.ts", "utf8");
const dispatcher = readFileSync("src/lib/domain-events/dispatcher.ts", "utf8");
const notificationConsumer = readFileSync("src/lib/notifications/consumer.ts", "utf8");
const notificationDraft = readFileSync("src/lib/notifications/draft.ts", "utf8");
const hud = readFileSync("src/components/external-interface/external-interface-layer.tsx", "utf8");
const hudApi = readFileSync("src/app/api/user-hud/route.ts", "utf8");
const modal = readFileSync("src/components/bug-reports/bug-report-modal.tsx", "utf8");
const registration = readFileSync("src/components/bug-reports/bug-report-entity-context.tsx", "utf8");
const mediaPage = readFileSync("src/app/media/[code]/page.tsx", "utf8");
const seriesPage = readFileSync("src/app/series/[code]/page.tsx", "utf8");
const quizModal = readFileSync("src/components/quizzes/quiz-modal.tsx", "utf8");
const adminList = readFileSync("src/app/admin/(protected)/bug-reports/page.tsx", "utf8");
const adminDetail = readFileSync("src/app/admin/(protected)/bug-reports/[id]/page.tsx", "utf8");
const adminAction = readFileSync("src/app/admin/(protected)/bug-reports/actions.ts", "utf8");
const adminLayout = readFileSync("src/app/admin/(protected)/layout.tsx", "utf8");
const adminNav = readFileSync("src/app/admin/(protected)/admin-nav-menu.tsx", "utf8");

describe("bug report data model", () => {
  it("keeps the v1 statuses, entity types, and exact transition matrix", () => {
    assert.deepEqual(BUG_REPORT_STATUSES, ["new", "reviewing", "confirmed", "fixed", "rejected"]);
    assert.deepEqual(BUG_REPORT_ENTITY_TYPES, ["media-item", "franchise", "quiz"]);
    assert.equal(isBugReportStatus("confirmed"), true);
    assert.equal(isBugReportStatus("closed"), false);
    assert.equal(isBugReportEntityType("quiz"), true);
    assert.equal(isBugReportEntityType("author"), false);

    const allowed = new Set([
      "new:reviewing", "new:confirmed", "new:rejected",
      "reviewing:confirmed", "reviewing:rejected",
      "confirmed:fixed", "rejected:reviewing", "fixed:confirmed",
    ]);
    for (const from of BUG_REPORT_STATUSES) {
      for (const to of BUG_REPORT_STATUSES) {
        assert.equal(canTransitionBugReportStatus(from, to), allowed.has(`${from}:${to}`), `${from} -> ${to}`);
      }
    }
  });

  it("defines persistence constraints, queue indexes, and non-destructive foreign keys", () => {
    for (const source of [schema, migration]) {
      assert.match(source, /bug_reports_description_check/);
      assert.match(source, /bug_reports_url_check/);
      assert.match(source, /left\([^\n]+, 2\) <> '\/\/'/);
      assert.match(source, /bug_reports_entity_pair_check/);
      assert.match(source, /bug_reports_status_check/);
      assert.match(source, /bug_reports_confirmed_at_check/);
      assert.match(source, /bug_reports_resolution_check/);
      assert.match(source, /bug_reports_status_created_at_idx/);
      assert.match(source, /bug_reports_author_confirmed_at_idx/);
    }
    assert.match(schema, /table\.confirmedAt\} is not null/);
    assert.match(migration, /"confirmed_at" is not null/);
    assert.match(migration, /FOREIGN KEY \("author_id"\)[\s\S]*ON DELETE restrict/);
    assert.match(migration, /FOREIGN KEY \("resolved_by_admin_id"\)[\s\S]*ON DELETE set null/);
    assert.doesNotMatch(migration, /bug_reports[^;]*ON DELETE cascade/i);
    assert.doesNotMatch(query, /delete\(bugReports\)/);
    assert.match(journal, /"idx": 77[\s\S]*"tag": "0077_bug_reports"/);
  });
});

describe("bug report creation API and domain facts", () => {
  it("requires an author and validates user input before persistence", () => {
    assert.match(api, /getCurrentAuthor\(\)/);
    assert.match(api, /if \(!author\)[\s\S]*status: 401/);
    assert.match(api, /description\.trim\(\)/);
    assert.match(api, /BUG_REPORT_DESCRIPTION_MAX_LENGTH/);
    assert.match(api, /hasEntityType !== hasEntityId/);
    assert.match(api, /isBugReportEntityType\(body\.entityType\)/);
    assert.match(api, /body\.entityId\.length > 200/);
    assert.match(api, /parsed\.origin !== origin/);
    assert.match(api, /parsed\.pathname\.startsWith\("\/\/"\)/);
    assert.match(api, /`\$\{parsed\.pathname\}\$\{parsed\.search\}\$\{parsed\.hash\}`/);
    assert.match(api, /request\.headers\.get\("user-agent"\)/);
    assert.doesNotMatch(api, /body\.authorId|body\.userAgent|body\.createdAt/);
    assert.match(api, /Response\.json\(\{ id: report\.id \}, \{ status: 201 \}\)/);
  });

  it("atomically inserts the report and a minimal created event", () => {
    assert.match(query, /createBugReport[\s\S]*runInDomainEventTransaction/);
    assert.match(query, /insert\(bugReports\)[\s\S]*appendEvent/);
    assert.match(query, /type: "bug-report\.created"/);
    assert.match(query, /payload: \{ authorId: input\.authorId, bugReportId: report\.id \}/);
    const createdPayload = domainCatalog.match(/"bug-report\.created": \{([^}]+)\}/)?.[1] ?? "";
    assert.match(createdPayload, /authorId: number/);
    assert.match(createdPayload, /bugReportId: number/);
    assert.doesNotMatch(createdPayload, /description|url|client|userAgent/);
  });
});

describe("bug report administration", () => {
  it("locks transitions, rejects stale state, keeps confirmation monotonic, and logs atomically", () => {
    assert.match(query, /for update/);
    assert.match(query, /expectedStatus[\s\S]*stale-status/);
    assert.match(query, /canTransitionBugReportStatus/);
    assert.match(query, /eq\(bugReports\.status, currentStatus\)/);
    assert.match(query, /firstConfirmation = input\.status === "confirmed" && current\.confirmedAt === null/);
    assert.match(query, /confirmedAt: firstConfirmation \? now : current\.confirmedAt/);
    assert.match(query, /resolvedAt: isClosing \? now : null/);
    assert.match(query, /resolvedByAdminId: isClosing \? input\.adminId : null/);
    assert.match(query, /insert\(adminActivityLogs\)/);
    assert.match(query, /if \(firstConfirmation\)[\s\S]*type: "bug-report\.confirmed"/);
    assert.match(query, /payload: \{ authorId: current\.authorId, bugReportId: input\.id \}/);
  });

  it("provides the minimal admin queue, detail flow, filtering, pagination, and open count", () => {
    assert.match(adminAction, /requireAdminUser\(\)/);
    assert.match(adminAction, /expectedStatus/);
    assert.match(adminList, /PAGE_SIZE = 25/);
    assert.match(adminList, /name="status"/);
    assert.match(adminList, /PaginationNav/);
    assert.match(adminDetail, /getBugReportActivityLogs/);
    assert.match(adminDetail, /canTransitionBugReportStatus/);
    assert.match(adminDetail, /whitespace-pre-wrap/);
    assert.match(adminDetail, /report\.clientContext/);
    assert.match(adminLayout, /getOpenBugReportCount\(\)/);
    assert.match(adminNav, /href: "\/admin\/bug-reports"/);
    assert.match(adminNav, /openBugReportsCount/);
  });
});

describe("bug report notifications", () => {
  it("creates an admin inbox draft from the database and has an independent disabled route", () => {
    assert.equal(getNotificationTitle("bug-report.created"), "Новый багрепорт");
    assert.equal(getNotificationRecipientType("bug-report.created"), "admin");
    assert.equal(getNotificationHref({
      entityId: "42",
      franchiseCode: null,
      mediaItemCode: null,
      type: "bug-report.created",
    }), "/admin/bug-reports/42");
    assert.equal(getExternalNotificationRoute("bug-report.created")?.code, "bug_report_created");
    assert.deepEqual(parseExternalNotificationRouteForm(new FormData()), {
      bug_report_created: [],
      submission_created: [],
    });
    assert.match(migration, /VALUES \('bug_report_created', '\[\]'::jsonb\)/);
    assert.match(notificationConsumer, /eventTypes:[\s\S]*"bug-report\.created"/);
    assert.match(notificationConsumer, /listAdminUserIds\(tx\)/);
    assert.match(notificationDraft, /from\(bugReports\)/);
    assert.match(notificationDraft, /event\.type === "bug-report\.created"/);
    assert.doesNotMatch(query, /Telegram|telegram|dispatchExternalNotificationTransports/);
  });

  it("inherits claim-before-handle idempotence from the domain dispatcher", () => {
    assert.match(dispatcher, /insert\(domainEventConsumptions\)[\s\S]*onConflictDoNothing\(\)[\s\S]*if \(!claimedRow\) return false/);
    assert.match(dispatcher, /await consumer\.handle\(tx, typedEvent\)/);
    assert.match(dispatcher, /if \(!claimed \|\| !consumer\.afterCommit\) continue/);
  });
});

describe("bug report HUD flow", () => {
  it("shows the global author utility outside admin and keeps quiz lives conditional", () => {
    assert.match(hudApi, /getCurrentAuthor\(\)/);
    assert.match(hudApi, /authenticated: false, quizParticipant: null/);
    assert.match(hudApi, /getActiveQuizParticipantState\(author\.id\)/);
    assert.match(hud, /fetch\("\/api\/user-hud"/);
    assert.match(hud, /authenticated && !isAdminRoute/);
    assert.match(hud, /visibleParticipant \?/);
    assert.match(hud, /aria-label="Сообщить об ошибке"/);
    assert.match(modal, /textarea/);
    assert.match(modal, /maxLength=\{2000\}/);
    assert.match(modal, /pending \|\| !description\.trim\(\)/);
    assert.match(modal, /viewportHeight: window\.innerHeight/);
    assert.match(modal, /timezone: Intl\.DateTimeFormat/);
  });

  it("uses cleanup-based stacked entity registration for pages and the open quiz", () => {
    assert.match(registration, /useEffect\([\s\S]*registerBugReportEntityContext/);
    assert.match(hud, /new Map<number, BugReportEntityContext>/);
    assert.match(hud, /bugReportContextsRef\.current\.delete\(registrationId\)/);
    assert.match(hud, /remainingContexts\.at\(-1\) \?\? null/);
    assert.match(mediaPage, /entityType: "media-item"/);
    assert.match(seriesPage, /entityType: "franchise"/);
    assert.match(quizModal, /entityType: "quiz"/);
  });
});
