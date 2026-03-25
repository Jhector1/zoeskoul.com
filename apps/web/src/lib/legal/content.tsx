// src/lib/legal/content.ts

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Learnoir";
const DBA_NAME = "ZoeSkoul";

const COMPANY_LEGAL_NAME = "ZoeSkoul LLC";
const COMPANY_ADDRESS = "123 Main Street, City, State/Province, Postal Code, Country";
const SUPPORT_EMAIL = "support@zoeskoul.com";
const PRIVACY_EMAIL = "privacy@zoeskoul.com";
const COPYRIGHT_EMAIL = "copyright@zoeskoul.com";
const DPO_EMAIL = "dpo@zoeskoul.com";

const EFFECTIVE_DATE = "March 11, 2026";
const LAST_UPDATED = "March 11, 2026";

export type LegalSlug =
    | "terms"
    | "privacy"
    | "cookies"
    | "refund"
    | "acceptable-use"
    | "community"
    | "dmca"
    | "ai-policy"
    | "academic-integrity"
    | "data-rights";

export type LegalSectionData = {
    id: string;
    title: string;
    paragraphs?: string[];
    list?: string[];
};

export type LegalDocumentData = {
    slug: LegalSlug;
    title: string;
    description: string;
    effectiveDate: string;
    lastUpdated: string;
    sections: LegalSectionData[];
};

export const LEGAL_VALUES = {
    appName: APP_NAME,
    dbaName: DBA_NAME,
    companyLegalName: COMPANY_LEGAL_NAME,
    companyAddress: COMPANY_ADDRESS,
    supportEmail: SUPPORT_EMAIL,
    privacyEmail: PRIVACY_EMAIL,
    copyrightEmail: COPYRIGHT_EMAIL,
    dpoEmail: DPO_EMAIL,
    effectiveDate: EFFECTIVE_DATE,
    lastUpdated: LAST_UPDATED,
};

export const LEGAL_DOCUMENTS: LegalDocumentData[] = [
    {
        slug: "terms",
        title: "@:LegalContent.documents.terms.title",
        description: "@:LegalContent.documents.terms.description",
        effectiveDate: "@:LegalContent.documents.terms.effectiveDate",
        lastUpdated: "@:LegalContent.documents.terms.lastUpdated",
        sections: [
            {
                id: "acceptance",
                title: "@:LegalContent.documents.terms.sections.acceptance.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.acceptance.paragraphs.0",
                    "@:LegalContent.documents.terms.sections.acceptance.paragraphs.1",
                ],
            },
            {
                id: "company",
                title: "@:LegalContent.documents.terms.sections.company.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.company.paragraphs.0",
                    "@:LegalContent.documents.terms.sections.company.paragraphs.1",
                    "@:LegalContent.documents.terms.sections.company.paragraphs.2",
                ],
            },
            {
                id: "services",
                title: "@:LegalContent.documents.terms.sections.services.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.services.paragraphs.0",
                    "@:LegalContent.documents.terms.sections.services.paragraphs.1",
                ],
            },
            {
                id: "eligibility",
                title: "@:LegalContent.documents.terms.sections.eligibility.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.eligibility.paragraphs.0",
                    "@:LegalContent.documents.terms.sections.eligibility.paragraphs.1",
                ],
            },
            {
                id: "subscriptions",
                title: "@:LegalContent.documents.terms.sections.subscriptions.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.subscriptions.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.terms.sections.subscriptions.list.0",
                    "@:LegalContent.documents.terms.sections.subscriptions.list.1",
                    "@:LegalContent.documents.terms.sections.subscriptions.list.2",
                    "@:LegalContent.documents.terms.sections.subscriptions.list.3",
                ],
            },
            {
                id: "license",
                title: "@:LegalContent.documents.terms.sections.license.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.license.paragraphs.0",
                    "@:LegalContent.documents.terms.sections.license.paragraphs.1",
                ],
            },
            {
                id: "user-content",
                title: "@:LegalContent.documents.terms.sections.user-content.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.user-content.paragraphs.0",
                    "@:LegalContent.documents.terms.sections.user-content.paragraphs.1",
                    "@:LegalContent.documents.terms.sections.user-content.paragraphs.2",
                ],
            },
            {
                id: "sandbox",
                title: "@:LegalContent.documents.terms.sections.sandbox.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.sandbox.paragraphs.0",
                    "@:LegalContent.documents.terms.sections.sandbox.paragraphs.1",
                ],
                list: [
                    "@:LegalContent.documents.terms.sections.sandbox.list.0",
                    "@:LegalContent.documents.terms.sections.sandbox.list.1",
                    "@:LegalContent.documents.terms.sections.sandbox.list.2",
                    "@:LegalContent.documents.terms.sections.sandbox.list.3",
                ],
            },
            {
                id: "acceptable-use",
                title: "@:LegalContent.documents.terms.sections.acceptable-use.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.acceptable-use.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.terms.sections.acceptable-use.list.0",
                    "@:LegalContent.documents.terms.sections.acceptable-use.list.1",
                    "@:LegalContent.documents.terms.sections.acceptable-use.list.2",
                    "@:LegalContent.documents.terms.sections.acceptable-use.list.3",
                    "@:LegalContent.documents.terms.sections.acceptable-use.list.4",
                    "@:LegalContent.documents.terms.sections.acceptable-use.list.5",
                    "@:LegalContent.documents.terms.sections.acceptable-use.list.6",
                ],
            },
            {
                id: "disclaimers",
                title: "@:LegalContent.documents.terms.sections.disclaimers.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.disclaimers.paragraphs.0",
                    "@:LegalContent.documents.terms.sections.disclaimers.paragraphs.1",
                ],
            },
            {
                id: "termination",
                title: "@:LegalContent.documents.terms.sections.termination.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.termination.paragraphs.0",
                    "@:LegalContent.documents.terms.sections.termination.paragraphs.1",
                ],
            },
            {
                id: "liability",
                title: "@:LegalContent.documents.terms.sections.liability.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.liability.paragraphs.0",
                    "@:LegalContent.documents.terms.sections.liability.paragraphs.1",
                ],
            },
            {
                id: "indemnity",
                title: "@:LegalContent.documents.terms.sections.indemnity.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.indemnity.paragraphs.0",
                ],
            },
            {
                id: "changes",
                title: "@:LegalContent.documents.terms.sections.changes.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.changes.paragraphs.0",
                ],
            },
            {
                id: "governing-law",
                title: "@:LegalContent.documents.terms.sections.governing-law.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.governing-law.paragraphs.0",
                ],
            },
            {
                id: "contact",
                title: "@:LegalContent.documents.terms.sections.contact.title",
                paragraphs: [
                    "@:LegalContent.documents.terms.sections.contact.paragraphs.0",
                ],
            },
        ],
    },

    {
        slug: "privacy",
        title: "@:LegalContent.documents.privacy.title",
        description: "@:LegalContent.documents.privacy.description",
        effectiveDate: "@:LegalContent.documents.privacy.effectiveDate",
        lastUpdated: "@:LegalContent.documents.privacy.lastUpdated",
        sections: [
            {
                id: "scope",
                title: "@:LegalContent.documents.privacy.sections.scope.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.scope.paragraphs.0",
                    "@:LegalContent.documents.privacy.sections.scope.paragraphs.1",
                ],
            },
            {
                id: "information-we-collect",
                title: "@:LegalContent.documents.privacy.sections.information-we-collect.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.information-we-collect.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.privacy.sections.information-we-collect.list.0",
                    "@:LegalContent.documents.privacy.sections.information-we-collect.list.1",
                    "@:LegalContent.documents.privacy.sections.information-we-collect.list.2",
                    "@:LegalContent.documents.privacy.sections.information-we-collect.list.3",
                    "@:LegalContent.documents.privacy.sections.information-we-collect.list.4",
                    "@:LegalContent.documents.privacy.sections.information-we-collect.list.5",
                ],
            },
            {
                id: "sources",
                title: "@:LegalContent.documents.privacy.sections.sources.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.sources.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.privacy.sections.sources.list.0",
                    "@:LegalContent.documents.privacy.sections.sources.list.1",
                    "@:LegalContent.documents.privacy.sections.sources.list.2",
                ],
            },
            {
                id: "use-of-information",
                title: "@:LegalContent.documents.privacy.sections.use-of-information.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.use-of-information.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.privacy.sections.use-of-information.list.0",
                    "@:LegalContent.documents.privacy.sections.use-of-information.list.1",
                    "@:LegalContent.documents.privacy.sections.use-of-information.list.2",
                    "@:LegalContent.documents.privacy.sections.use-of-information.list.3",
                    "@:LegalContent.documents.privacy.sections.use-of-information.list.4",
                    "@:LegalContent.documents.privacy.sections.use-of-information.list.5",
                    "@:LegalContent.documents.privacy.sections.use-of-information.list.6",
                    "@:LegalContent.documents.privacy.sections.use-of-information.list.7",
                    "@:LegalContent.documents.privacy.sections.use-of-information.list.8",
                    "@:LegalContent.documents.privacy.sections.use-of-information.list.9",
                ],
            },
            {
                id: "legal-bases",
                title: "@:LegalContent.documents.privacy.sections.legal-bases.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.legal-bases.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.privacy.sections.legal-bases.list.0",
                    "@:LegalContent.documents.privacy.sections.legal-bases.list.1",
                    "@:LegalContent.documents.privacy.sections.legal-bases.list.2",
                    "@:LegalContent.documents.privacy.sections.legal-bases.list.3",
                    "@:LegalContent.documents.privacy.sections.legal-bases.list.4",
                ],
            },
            {
                id: "sharing",
                title: "@:LegalContent.documents.privacy.sections.sharing.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.sharing.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.privacy.sections.sharing.list.0",
                    "@:LegalContent.documents.privacy.sections.sharing.list.1",
                    "@:LegalContent.documents.privacy.sections.sharing.list.2",
                    "@:LegalContent.documents.privacy.sections.sharing.list.3",
                    "@:LegalContent.documents.privacy.sections.sharing.list.4",
                    "@:LegalContent.documents.privacy.sections.sharing.list.5",
                    "@:LegalContent.documents.privacy.sections.sharing.list.6",
                ],
            },
            {
                id: "retention",
                title: "@:LegalContent.documents.privacy.sections.retention.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.retention.paragraphs.0",
                ],
            },
            {
                id: "security",
                title: "@:LegalContent.documents.privacy.sections.security.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.security.paragraphs.0",
                ],
            },
            {
                id: "international-transfers",
                title: "@:LegalContent.documents.privacy.sections.international-transfers.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.international-transfers.paragraphs.0",
                ],
            },
            {
                id: "children",
                title: "@:LegalContent.documents.privacy.sections.children.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.children.paragraphs.0",
                ],
            },
            {
                id: "rights",
                title: "@:LegalContent.documents.privacy.sections.rights.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.rights.paragraphs.0",
                ],
            },
            {
                id: "cookies",
                title: "@:LegalContent.documents.privacy.sections.cookies.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.cookies.paragraphs.0",
                ],
            },
            {
                id: "changes",
                title: "@:LegalContent.documents.privacy.sections.changes.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.changes.paragraphs.0",
                ],
            },
            {
                id: "contact",
                title: "@:LegalContent.documents.privacy.sections.contact.title",
                paragraphs: [
                    "@:LegalContent.documents.privacy.sections.contact.paragraphs.0",
                ],
            },
        ],
    },

    {
        slug: "cookies",
        title: "@:LegalContent.documents.cookies.title",
        description: "@:LegalContent.documents.cookies.description",
        effectiveDate: "@:LegalContent.documents.cookies.effectiveDate",
        lastUpdated: "@:LegalContent.documents.cookies.lastUpdated",
        sections: [
            {
                id: "what-are-cookies",
                title: "@:LegalContent.documents.cookies.sections.what-are-cookies.title",
                paragraphs: [
                    "@:LegalContent.documents.cookies.sections.what-are-cookies.paragraphs.0",
                ],
            },
            {
                id: "why-we-use-cookies",
                title: "@:LegalContent.documents.cookies.sections.why-we-use-cookies.title",
                paragraphs: [
                    "@:LegalContent.documents.cookies.sections.why-we-use-cookies.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.cookies.sections.why-we-use-cookies.list.0",
                    "@:LegalContent.documents.cookies.sections.why-we-use-cookies.list.1",
                    "@:LegalContent.documents.cookies.sections.why-we-use-cookies.list.2",
                    "@:LegalContent.documents.cookies.sections.why-we-use-cookies.list.3",
                    "@:LegalContent.documents.cookies.sections.why-we-use-cookies.list.4",
                    "@:LegalContent.documents.cookies.sections.why-we-use-cookies.list.5",
                ],
            },
            {
                id: "types",
                title: "@:LegalContent.documents.cookies.sections.types.title",
                list: [
                    "@:LegalContent.documents.cookies.sections.types.list.0",
                    "@:LegalContent.documents.cookies.sections.types.list.1",
                    "@:LegalContent.documents.cookies.sections.types.list.2",
                    "@:LegalContent.documents.cookies.sections.types.list.3",
                ],
            },
            {
                id: "third-party",
                title: "@:LegalContent.documents.cookies.sections.third-party.title",
                paragraphs: [
                    "@:LegalContent.documents.cookies.sections.third-party.paragraphs.0",
                ],
            },
            {
                id: "choices",
                title: "@:LegalContent.documents.cookies.sections.choices.title",
                paragraphs: [
                    "@:LegalContent.documents.cookies.sections.choices.paragraphs.0",
                ],
            },
            {
                id: "local-storage",
                title: "@:LegalContent.documents.cookies.sections.local-storage.title",
                paragraphs: [
                    "@:LegalContent.documents.cookies.sections.local-storage.paragraphs.0",
                ],
            },
            {
                id: "changes",
                title: "@:LegalContent.documents.cookies.sections.changes.title",
                paragraphs: [
                    "@:LegalContent.documents.cookies.sections.changes.paragraphs.0",
                ],
            },
            {
                id: "contact",
                title: "@:LegalContent.documents.cookies.sections.contact.title",
                paragraphs: [
                    "@:LegalContent.documents.cookies.sections.contact.paragraphs.0",
                ],
            },
        ],
    },

    {
        slug: "refund",
        title: "@:LegalContent.documents.refund.title",
        description: "@:LegalContent.documents.refund.description",
        effectiveDate: "@:LegalContent.documents.refund.effectiveDate",
        lastUpdated: "@:LegalContent.documents.refund.lastUpdated",
        sections: [
            {
                id: "overview",
                title: "@:LegalContent.documents.refund.sections.overview.title",
                paragraphs: [
                    "@:LegalContent.documents.refund.sections.overview.paragraphs.0",
                ],
            },
            {
                id: "subscriptions",
                title: "@:LegalContent.documents.refund.sections.subscriptions.title",
                paragraphs: [
                    "@:LegalContent.documents.refund.sections.subscriptions.paragraphs.0",
                ],
            },
            {
                id: "refund-eligibility",
                title: "@:LegalContent.documents.refund.sections.refund-eligibility.title",
                paragraphs: [
                    "@:LegalContent.documents.refund.sections.refund-eligibility.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.refund.sections.refund-eligibility.list.0",
                    "@:LegalContent.documents.refund.sections.refund-eligibility.list.1",
                    "@:LegalContent.documents.refund.sections.refund-eligibility.list.2",
                    "@:LegalContent.documents.refund.sections.refund-eligibility.list.3",
                ],
            },
            {
                id: "non-refundable",
                title: "@:LegalContent.documents.refund.sections.non-refundable.title",
                paragraphs: [
                    "@:LegalContent.documents.refund.sections.non-refundable.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.refund.sections.non-refundable.list.0",
                    "@:LegalContent.documents.refund.sections.non-refundable.list.1",
                    "@:LegalContent.documents.refund.sections.non-refundable.list.2",
                    "@:LegalContent.documents.refund.sections.non-refundable.list.3",
                    "@:LegalContent.documents.refund.sections.non-refundable.list.4",
                ],
            },
            {
                id: "how-to-request",
                title: "@:LegalContent.documents.refund.sections.how-to-request.title",
                paragraphs: [
                    "@:LegalContent.documents.refund.sections.how-to-request.paragraphs.0",
                ],
            },
            {
                id: "chargebacks",
                title: "@:LegalContent.documents.refund.sections.chargebacks.title",
                paragraphs: [
                    "@:LegalContent.documents.refund.sections.chargebacks.paragraphs.0",
                ],
            },
            {
                id: "changes",
                title: "@:LegalContent.documents.refund.sections.changes.title",
                paragraphs: [
                    "@:LegalContent.documents.refund.sections.changes.paragraphs.0",
                ],
            },
        ],
    },

    {
        slug: "acceptable-use",
        title: "@:LegalContent.documents.acceptable-use.title",
        description: "@:LegalContent.documents.acceptable-use.description",
        effectiveDate: "@:LegalContent.documents.acceptable-use.effectiveDate",
        lastUpdated: "@:LegalContent.documents.acceptable-use.lastUpdated",
        sections: [
            {
                id: "purpose",
                title: "@:LegalContent.documents.acceptable-use.sections.purpose.title",
                paragraphs: [
                    "@:LegalContent.documents.acceptable-use.sections.purpose.paragraphs.0",
                ],
            },
            {
                id: "prohibited-activity",
                title: "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.title",
                paragraphs: [
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.list.0",
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.list.1",
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.list.2",
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.list.3",
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.list.4",
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.list.5",
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.list.6",
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.list.7",
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.list.8",
                    "@:LegalContent.documents.acceptable-use.sections.prohibited-activity.list.9",
                ],
            },
            {
                id: "technical-environments",
                title: "@:LegalContent.documents.acceptable-use.sections.technical-environments.title",
                paragraphs: [
                    "@:LegalContent.documents.acceptable-use.sections.technical-environments.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.acceptable-use.sections.technical-environments.list.0",
                    "@:LegalContent.documents.acceptable-use.sections.technical-environments.list.1",
                    "@:LegalContent.documents.acceptable-use.sections.technical-environments.list.2",
                    "@:LegalContent.documents.acceptable-use.sections.technical-environments.list.3",
                    "@:LegalContent.documents.acceptable-use.sections.technical-environments.list.4",
                ],
            },
            {
                id: "enforcement",
                title: "@:LegalContent.documents.acceptable-use.sections.enforcement.title",
                paragraphs: [
                    "@:LegalContent.documents.acceptable-use.sections.enforcement.paragraphs.0",
                ],
            },
            {
                id: "reporting",
                title: "@:LegalContent.documents.acceptable-use.sections.reporting.title",
                paragraphs: [
                    "@:LegalContent.documents.acceptable-use.sections.reporting.paragraphs.0",
                ],
            },
        ],
    },

    {
        slug: "community",
        title: "@:LegalContent.documents.community.title",
        description: "@:LegalContent.documents.community.description",
        effectiveDate: "@:LegalContent.documents.community.effectiveDate",
        lastUpdated: "@:LegalContent.documents.community.lastUpdated",
        sections: [
            {
                id: "principles",
                title: "@:LegalContent.documents.community.sections.principles.title",
                paragraphs: [
                    "@:LegalContent.documents.community.sections.principles.paragraphs.0",
                ],
            },
            {
                id: "be-respectful",
                title: "@:LegalContent.documents.community.sections.be-respectful.title",
                paragraphs: [
                    "@:LegalContent.documents.community.sections.be-respectful.paragraphs.0",
                ],
            },
            {
                id: "be-constructive",
                title: "@:LegalContent.documents.community.sections.be-constructive.title",
                paragraphs: [
                    "@:LegalContent.documents.community.sections.be-constructive.paragraphs.0",
                ],
            },
            {
                id: "do-not-spam",
                title: "@:LegalContent.documents.community.sections.do-not-spam.title",
                paragraphs: [
                    "@:LegalContent.documents.community.sections.do-not-spam.paragraphs.0",
                ],
            },
            {
                id: "sensitive-content",
                title: "@:LegalContent.documents.community.sections.sensitive-content.title",
                paragraphs: [
                    "@:LegalContent.documents.community.sections.sensitive-content.paragraphs.0",
                ],
            },
            {
                id: "moderation",
                title: "@:LegalContent.documents.community.sections.moderation.title",
                paragraphs: [
                    "@:LegalContent.documents.community.sections.moderation.paragraphs.0",
                ],
            },
            {
                id: "reporting",
                title: "@:LegalContent.documents.community.sections.reporting.title",
                paragraphs: [
                    "@:LegalContent.documents.community.sections.reporting.paragraphs.0",
                ],
            },
        ],
    },

    {
        slug: "dmca",
        title: "@:LegalContent.documents.dmca.title",
        description: "@:LegalContent.documents.dmca.description",
        effectiveDate: "@:LegalContent.documents.dmca.effectiveDate",
        lastUpdated: "@:LegalContent.documents.dmca.lastUpdated",
        sections: [
            {
                id: "overview",
                title: "@:LegalContent.documents.dmca.sections.overview.title",
                paragraphs: [
                    "@:LegalContent.documents.dmca.sections.overview.paragraphs.0",
                ],
            },
            {
                id: "submit-notice",
                title: "@:LegalContent.documents.dmca.sections.submit-notice.title",
                paragraphs: [
                    "@:LegalContent.documents.dmca.sections.submit-notice.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.dmca.sections.submit-notice.list.0",
                    "@:LegalContent.documents.dmca.sections.submit-notice.list.1",
                    "@:LegalContent.documents.dmca.sections.submit-notice.list.2",
                    "@:LegalContent.documents.dmca.sections.submit-notice.list.3",
                    "@:LegalContent.documents.dmca.sections.submit-notice.list.4",
                    "@:LegalContent.documents.dmca.sections.submit-notice.list.5",
                ],
            },
            {
                id: "counter-notice",
                title: "@:LegalContent.documents.dmca.sections.counter-notice.title",
                paragraphs: [
                    "@:LegalContent.documents.dmca.sections.counter-notice.paragraphs.0",
                ],
            },
            {
                id: "repeat-infringers",
                title: "@:LegalContent.documents.dmca.sections.repeat-infringers.title",
                paragraphs: [
                    "@:LegalContent.documents.dmca.sections.repeat-infringers.paragraphs.0",
                ],
            },
            {
                id: "good-faith",
                title: "@:LegalContent.documents.dmca.sections.good-faith.title",
                paragraphs: [
                    "@:LegalContent.documents.dmca.sections.good-faith.paragraphs.0",
                ],
            },
        ],
    },

    {
        slug: "ai-policy",
        title: "@:LegalContent.documents.ai-policy.title",
        description: "@:LegalContent.documents.ai-policy.description",
        effectiveDate: "@:LegalContent.documents.ai-policy.effectiveDate",
        lastUpdated: "@:LegalContent.documents.ai-policy.lastUpdated",
        sections: [
            {
                id: "scope",
                title: "@:LegalContent.documents.ai-policy.sections.scope.title",
                paragraphs: [
                    "@:LegalContent.documents.ai-policy.sections.scope.paragraphs.0",
                ],
            },
            {
                id: "limitations",
                title: "@:LegalContent.documents.ai-policy.sections.limitations.title",
                paragraphs: [
                    "@:LegalContent.documents.ai-policy.sections.limitations.paragraphs.0",
                ],
            },
            {
                id: "allowed-uses",
                title: "@:LegalContent.documents.ai-policy.sections.allowed-uses.title",
                paragraphs: [
                    "@:LegalContent.documents.ai-policy.sections.allowed-uses.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.ai-policy.sections.allowed-uses.list.0",
                    "@:LegalContent.documents.ai-policy.sections.allowed-uses.list.1",
                    "@:LegalContent.documents.ai-policy.sections.allowed-uses.list.2",
                    "@:LegalContent.documents.ai-policy.sections.allowed-uses.list.3",
                ],
            },
            {
                id: "prohibited-uses",
                title: "@:LegalContent.documents.ai-policy.sections.prohibited-uses.title",
                paragraphs: [
                    "@:LegalContent.documents.ai-policy.sections.prohibited-uses.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.ai-policy.sections.prohibited-uses.list.0",
                    "@:LegalContent.documents.ai-policy.sections.prohibited-uses.list.1",
                    "@:LegalContent.documents.ai-policy.sections.prohibited-uses.list.2",
                    "@:LegalContent.documents.ai-policy.sections.prohibited-uses.list.3",
                    "@:LegalContent.documents.ai-policy.sections.prohibited-uses.list.4",
                    "@:LegalContent.documents.ai-policy.sections.prohibited-uses.list.5",
                ],
            },
            {
                id: "review",
                title: "@:LegalContent.documents.ai-policy.sections.review.title",
                paragraphs: [
                    "@:LegalContent.documents.ai-policy.sections.review.paragraphs.0",
                ],
            },
            {
                id: "responsibility",
                title: "@:LegalContent.documents.ai-policy.sections.responsibility.title",
                paragraphs: [
                    "@:LegalContent.documents.ai-policy.sections.responsibility.paragraphs.0",
                ],
            },
        ],
    },

    {
        slug: "academic-integrity",
        title: "@:LegalContent.documents.academic-integrity.title",
        description: "@:LegalContent.documents.academic-integrity.description",
        effectiveDate: "@:LegalContent.documents.academic-integrity.effectiveDate",
        lastUpdated: "@:LegalContent.documents.academic-integrity.lastUpdated",
        sections: [
            {
                id: "purpose",
                title: "@:LegalContent.documents.academic-integrity.sections.purpose.title",
                paragraphs: [
                    "@:LegalContent.documents.academic-integrity.sections.purpose.paragraphs.0",
                ],
            },
            {
                id: "violations",
                title: "@:LegalContent.documents.academic-integrity.sections.violations.title",
                paragraphs: [
                    "@:LegalContent.documents.academic-integrity.sections.violations.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.academic-integrity.sections.violations.list.0",
                    "@:LegalContent.documents.academic-integrity.sections.violations.list.1",
                    "@:LegalContent.documents.academic-integrity.sections.violations.list.2",
                    "@:LegalContent.documents.academic-integrity.sections.violations.list.3",
                    "@:LegalContent.documents.academic-integrity.sections.violations.list.4",
                    "@:LegalContent.documents.academic-integrity.sections.violations.list.5",
                ],
            },
            {
                id: "ai-and-integrity",
                title: "@:LegalContent.documents.academic-integrity.sections.ai-and-integrity.title",
                paragraphs: [
                    "@:LegalContent.documents.academic-integrity.sections.ai-and-integrity.paragraphs.0",
                ],
            },
            {
                id: "consequences",
                title: "@:LegalContent.documents.academic-integrity.sections.consequences.title",
                paragraphs: [
                    "@:LegalContent.documents.academic-integrity.sections.consequences.paragraphs.0",
                ],
                list: [
                    "@:LegalContent.documents.academic-integrity.sections.consequences.list.0",
                    "@:LegalContent.documents.academic-integrity.sections.consequences.list.1",
                    "@:LegalContent.documents.academic-integrity.sections.consequences.list.2",
                    "@:LegalContent.documents.academic-integrity.sections.consequences.list.3",
                    "@:LegalContent.documents.academic-integrity.sections.consequences.list.4",
                ],
            },
            {
                id: "appeals",
                title: "@:LegalContent.documents.academic-integrity.sections.appeals.title",
                paragraphs: [
                    "@:LegalContent.documents.academic-integrity.sections.appeals.paragraphs.0",
                ],
            },
        ],
    },

    {
        slug: "data-rights",
        title: "@:LegalContent.documents.data-rights.title",
        description: "@:LegalContent.documents.data-rights.description",
        effectiveDate: "@:LegalContent.documents.data-rights.effectiveDate",
        lastUpdated: "@:LegalContent.documents.data-rights.lastUpdated",
        sections: [
            {
                id: "overview",
                title: "@:LegalContent.documents.data-rights.sections.overview.title",
                paragraphs: [
                    "@:LegalContent.documents.data-rights.sections.overview.paragraphs.0",
                ],
            },
            {
                id: "rights-list",
                title: "@:LegalContent.documents.data-rights.sections.rights-list.title",
                list: [
                    "@:LegalContent.documents.data-rights.sections.rights-list.list.0",
                    "@:LegalContent.documents.data-rights.sections.rights-list.list.1",
                    "@:LegalContent.documents.data-rights.sections.rights-list.list.2",
                    "@:LegalContent.documents.data-rights.sections.rights-list.list.3",
                    "@:LegalContent.documents.data-rights.sections.rights-list.list.4",
                    "@:LegalContent.documents.data-rights.sections.rights-list.list.5",
                    "@:LegalContent.documents.data-rights.sections.rights-list.list.6",
                ],
            },
            {
                id: "how-to-request",
                title: "@:LegalContent.documents.data-rights.sections.how-to-request.title",
                paragraphs: [
                    "@:LegalContent.documents.data-rights.sections.how-to-request.paragraphs.0",
                ],
            },
            {
                id: "timing",
                title: "@:LegalContent.documents.data-rights.sections.timing.title",
                paragraphs: [
                    "@:LegalContent.documents.data-rights.sections.timing.paragraphs.0",
                ],
            },
            {
                id: "appeals",
                title: "@:LegalContent.documents.data-rights.sections.appeals.title",
                paragraphs: [
                    "@:LegalContent.documents.data-rights.sections.appeals.paragraphs.0",
                ],
            },
            {
                id: "dpo",
                title: "@:LegalContent.documents.data-rights.sections.dpo.title",
                paragraphs: [
                    "@:LegalContent.documents.data-rights.sections.dpo.paragraphs.0",
                ],
            },
        ],
    },
];

export const LEGAL_DOCS_BY_SLUG = Object.fromEntries(
    LEGAL_DOCUMENTS.map((doc) => [doc.slug, doc])
) as Record<LegalSlug, LegalDocumentData>;

export const LEGAL_INDEX = LEGAL_DOCUMENTS.map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    effectiveDate: doc.effectiveDate,
    lastUpdated: doc.lastUpdated,
}));