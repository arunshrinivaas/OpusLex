import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OpusLexBrand } from "./OpusLexBrand";

const PolicyLayout = ({ title, children, onBack }: { title: string; children: React.ReactNode; onBack: () => void }) => {
    const { t } = useTranslation();
    return (
        <div className="min-h-screen bg-white text-neutral-900 dark:bg-[#0d0d0d] dark:text-[#ececec] flex flex-col transition-colors">
            <header className="sticky top-0 z-10 bg-white/80 dark:bg-[#171717]/80 backdrop-blur-md border-b border-neutral-100 dark:border-[#262626] px-6 py-4 flex items-center justify-between">
                <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors">
                    <ArrowLeft size={16} />
                    {t("common.back", "Back")}
                </button>
                <div className="scale-75 origin-right">
                    <OpusLexBrand className="w-[120px]" />
                </div>
            </header>
            <main className="flex-1 max-w-3xl w-full mx-auto p-6 sm:p-12 md:p-16">
                <h1 className="text-3xl font-semibold tracking-tight mb-8 text-neutral-900 dark:text-white">{title}</h1>
                <div className="prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed space-y-6">
                    {children}
                </div>
            </main>
        </div>
    );
};

export const TermsPage = ({ onBack }: { onBack: () => void }) => (
    <PolicyLayout title="Terms of Service" onBack={onBack}>
        <p className="text-neutral-500 font-medium">Last Updated: September 2026</p>
        <p><strong>DRAFT FOR LEGAL REVIEW. DO NOT USE IN PRODUCTION.</strong></p>
        <h2>1. Acceptance of Terms</h2>
        <p>By creating an account or accessing OpusLex, you agree to these Terms of Service. OpusLex provides an enterprise legal & compliance research assistant utilizing AI technologies, document repositories, and investigations workflows.</p>
        <h2>2. Service Availability</h2>
        <p>Currently available features include email/password authentication, document repositories, RAG research, Investigations, AI Agents, Knowledge sharing, Audit/history functionality, Governance/compliance information, and user profiles. Note that third-party integrations (e.g., Google authentication, Apple authentication, cloud-drive integrations) are not currently operational.</p>
        <h2>3. User Responsibilities & Acceptable Use</h2>
        <p>You are responsible for maintaining the confidentiality of your account credentials. You agree not to use the Service for any unlawful purpose or to upload malicious content.</p>
        <h2>4. Intellectual Property & Uploaded Content</h2>
        <p>You retain all rights to the documents and data you upload to the Service. You grant OpusLex a limited license to process this data solely to provide the Service to you.</p>
        <h2>5. AI-Generated Outputs & Legal Disclaimer</h2>
        <p><strong>Disclaimer:</strong> OpusLex provides research assistance and AI-generated outputs based on available data. It does not provide legal advice. You must independently verify any AI-generated information before relying on it for legal or compliance purposes.</p>
        <h2>6. Changes to Terms</h2>
        <p>We may modify these Terms at any time. Continued use of the Service constitutes acceptance of the modified Terms.</p>
        <h2>7. Contact Information</h2>
        <p>For any questions regarding these Terms, please contact our legal department or your designated account representative.</p>
    </PolicyLayout>
);

export const PrivacyPage = ({ onBack }: { onBack: () => void }) => (
    <PolicyLayout title="Privacy Policy" onBack={onBack}>
        <p className="text-neutral-500 font-medium">Last Updated: September 2026</p>
        <p><strong>DRAFT FOR LEGAL REVIEW. DO NOT USE IN PRODUCTION.</strong></p>
        <h2>1. Introduction</h2>
        <p>This Privacy Policy explains how OpusLex collects, uses, and protects your information when you use our enterprise legal & compliance research assistant.</p>
        <h2>2. Data We Collect</h2>
        <p>We collect your email address, full name, and password for authentication purposes. We also collect and process the documents, research history, and investigation data you upload to the Service.</p>
        <h2>3. How We Use Your Data</h2>
        <p>Your data is used solely to provide and improve the OpusLex Service (including RAG research, AI Agents, and Audit functionality). We do not train public AI models on your private data.</p>
        <h2>4. Third-Party Services</h2>
        <p>Currently, the Service utilizes proprietary infrastructure. Integrations with third-party authentication providers (e.g., Google, Apple) and cloud drives are planned but not currently active.</p>
        <h2>5. Data Retention</h2>
        <p>We retain your data for as long as your account is active or as necessary to fulfill the purposes outlined in this policy. Specific retention periods will be established in accordance with applicable laws.</p>
        <h2>6. Security</h2>
        <p>We implement industry-standard security measures to protect your data. However, no internet transmission is completely secure.</p>
        <h2>7. Your Rights</h2>
        <p>You may request access to, correction, or deletion of your personal data by contacting our privacy team through your account settings or designated support channels.</p>
    </PolicyLayout>
);

export const CookiesPage = ({ onBack }: { onBack: () => void }) => (
    <PolicyLayout title="Cookies Policy" onBack={onBack}>
        <p className="text-neutral-500 font-medium">Last Updated: September 2026</p>
        <p><strong>DRAFT FOR LEGAL REVIEW. DO NOT USE IN PRODUCTION.</strong></p>
        <h2>1. What Are Cookies?</h2>
        <p>Cookies are small text files stored on your device that help us operate the Service and remember your preferences.</p>
        <h2>2. How We Use Cookies & Local Storage</h2>
        <p>OpusLex currently uses local storage and necessary cookies exclusively to maintain your session (e.g., storing your access token) and to remember your cookie consent preferences.</p>
        <h2>3. Types of Cookies</h2>
        <p><strong>Strictly Necessary:</strong> Required for core application functionality such as authentication and session management.</p>
        <p><strong>Analytics & Marketing:</strong> Currently, OpusLex does not configure or use optional tracking or marketing cookies.</p>
        <h2>4. Managing Your Preferences</h2>
        <p>You can manage your cookie preferences through the "Cookie Settings" link available in the application footer.</p>
    </PolicyLayout>
);
