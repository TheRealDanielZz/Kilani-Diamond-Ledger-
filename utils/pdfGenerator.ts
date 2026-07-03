
import { jsPDF } from "jspdf";
import { Project, ProjectCostSummary, User, ProjectStatus } from "../types";
import { store } from "../services/store";

const MARGIN = 20; // mm
const PAGE_WIDTH = 210; // A4 Width in mm
const PAGE_HEIGHT = 297; // A4 Height in mm
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

// Colors (RGB)
const C_BLACK = [22, 23, 29];
const C_GOLD = [184, 134, 11]; // Darker gold for text readability on white
const C_GRAY = [80, 80, 80];
const C_LIGHT_GRAY = [240, 240, 240];

export const generateProjectPDF = async (project: Project, cost: ProjectCostSummary, currentUser: User | null, liveGoldPriceTimestamp?: string) => {
    const doc = new jsPDF();
    let y = MARGIN;
    const repair = store.getRepairDetails(project);
    const repairCost = store.getRepairCostSummary(project.id);

    // --- Header ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
    doc.text("KILANI", MARGIN, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
    doc.text("DIAMOND LEDGER", MARGIN + 28, y); // Offset from Title

    // Report Title & Date
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
    doc.text("PROJECT COST REPORT", PAGE_WIDTH - MARGIN, y, { align: "right" });

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(new Date().toLocaleDateString(), PAGE_WIDTH - MARGIN, y, { align: "right" });

    y += 10;
    // Horizontal Line
    doc.setDrawColor(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 10;

    // --- Project Info Section ---
    const startY = y;

    // Left Column: Details
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
    doc.text(project.code, MARGIN, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(project.pieceName, MARGIN, y);
    y += 10;

    // Metadata Grid
    const drawMeta = (label: string, value: string, x: number, y: number) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
        doc.text(label.toUpperCase(), x, y);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
        doc.text(value, x, y + 5);
    };

    drawMeta("Client", project.clientName || "-", MARGIN, y);
    drawMeta("Sales Rep", store.getUser(project.salesRepId || "")?.name || "-", MARGIN + 40, y);
    y += 15;

    drawMeta("Submitted", new Date(project.createdAt).toLocaleDateString(), MARGIN, y);
    drawMeta("Finished", project.status === ProjectStatus.CLOSED && project.projectEndGoldPriceCapturedAt ? new Date(project.projectEndGoldPriceCapturedAt).toLocaleDateString() : "Pending", MARGIN + 40, y);
    y += 15;

    drawMeta("Gold Type", `${project.goldPurity || ""} ${project.goldType || ""}`, MARGIN, y);
    drawMeta("Status", project.status.replace("_", " "), MARGIN + 40, y);
    y += 15;

    if (repair) {
        drawMeta("Service Type", "Repair", MARGIN, y);
        drawMeta("Repair Type", repair.type, MARGIN + 40, y);
        drawMeta("Repair Status", repair.status, MARGIN + 95, y);
        y += 15;
    }

    // Right Column: Image
    const imgWidth = 80;
    const imgHeight = 80;
    const imgX = PAGE_WIDTH - MARGIN - imgWidth;

    if (project.projectPhotos && project.projectPhotos.length > 0) {
        try {
            doc.addImage(project.projectPhotos[0], "JPEG", imgX, startY, imgWidth, imgHeight, undefined, 'FAST');
        } catch (e) {
            console.warn("Could not add image to PDF", e);
            // Draw Placeholder
            doc.setDrawColor(200, 200, 200);
            doc.setFillColor(245, 245, 245);
            doc.rect(imgX, startY, imgWidth, imgHeight, "FD");
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text("Image Unavailable", imgX + imgWidth / 2, startY + imgHeight / 2, { align: "center" });
        }
    } else {
        // Draw Placeholder
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(245, 245, 245);
        doc.rect(imgX, startY, imgWidth, imgHeight, "FD");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("No Image", imgX + imgWidth / 2, startY + imgHeight / 2, { align: "center" });
    }

    // Move Y past the image area
    y = Math.max(y, startY + imgHeight) + 15;

    // --- Financial Summary ---

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
    doc.text("FINANCIAL SUMMARY", MARGIN, y);
    y += 8;

    if (repair) {
        doc.setFillColor(C_LIGHT_GRAY[0], C_LIGHT_GRAY[1], C_LIGHT_GRAY[2]);
        doc.rect(MARGIN, y, CONTENT_WIDTH, 48, "F");
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
        doc.text("REPAIR COST SUMMARY", MARGIN + 5, y + 8);
        doc.setFont("helvetica", "normal");
        doc.text(`Labour: $${repairCost.labourCostCad.toFixed(2)}`, MARGIN + 5, y + 17);
        doc.text(`Gold: $${repairCost.goldCostCad.toFixed(2)}${repairCost.goldUsedG ? ` (${repairCost.goldUsedG}g)` : ""}`, MARGIN + 5, y + 25);
        doc.text(`Diamond: $${repairCost.diamondCostCad.toFixed(2)}${repairCost.diamondPieces ? ` (${repairCost.diamondPieces} pcs)` : ""}`, MARGIN + 5, y + 33);
        doc.text(`Outsource/Material: $${(repairCost.outsourcedCostCad + repairCost.materialCostCad).toFixed(2)}`, MARGIN + 5, y + 41);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
        doc.text(`Internal: $${repairCost.totalInternalCostCad.toFixed(2)}`, PAGE_WIDTH - MARGIN - 5, y + 17, { align: "right" });
        doc.text(`Client: $${repairCost.finalClientChargeCad.toFixed(2)}`, PAGE_WIDTH - MARGIN - 5, y + 27, { align: "right" });
        doc.text(`Profit/Loss: $${repairCost.profitLossCad.toFixed(2)}`, PAGE_WIDTH - MARGIN - 5, y + 37, { align: "right" });
        if (repairCost.noCharge) {
            doc.setFont("helvetica", "normal");
            doc.setTextColor(180, 0, 0);
            doc.text(`No Charge: ${repairCost.noChargeReason || "Reason not specified"}`, PAGE_WIDTH - MARGIN - 5, y + 45, { align: "right" });
        }
        y += 56;
    }

    // 1. Gold Cost Section
    const hasMultipleGold = cost.goldBreakdown && cost.goldBreakdown.length > 1;
    const goldSectionHeight = hasMultipleGold ? 32 + (cost.goldBreakdown.length * 10) : 35;

    doc.setFillColor(C_LIGHT_GRAY[0], C_LIGHT_GRAY[1], C_LIGHT_GRAY[2]);
    doc.rect(MARGIN, y, CONTENT_WIDTH, goldSectionHeight, "F"); // Background

    doc.setFontSize(9);
    doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
    doc.text("FINAL GOLD COST (CAD)", MARGIN + 5, y + 8);

    // Total Value
    doc.setFontSize(14);
    doc.setTextColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
    doc.text(cost.goldCost > 0 ? `$${cost.goldCost.toFixed(2)}` : "Pending Weight", MARGIN + 5, y + 16);

    // Status Badge
    const isLocked = cost.isLocked;
    doc.setFontSize(8);
    doc.setTextColor(isLocked ? 0 : 180, isLocked ? 100 : 100, isLocked ? 0 : 0); // Dark Green or Dark Orange
    const statusText = isLocked
        ? `LOCKED • ${project.projectEndGoldPriceCapturedAt ? new Date(project.projectEndGoldPriceCapturedAt).toLocaleString() : ''}`
        : `ESTIMATED (LIVE) • ${liveGoldPriceTimestamp ? new Date(liveGoldPriceTimestamp).toLocaleTimeString() : 'Just now'}`;
    doc.text(statusText, MARGIN + 5, y + 22);

    if (hasMultipleGold) {
        // Draw Breakdown
        let gy = y + 32;
        cost.goldBreakdown.forEach(gb => {
            doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.text(`${gb.label.toUpperCase()}:`, MARGIN + 5, gy);

            doc.setFont("helvetica", "normal");
            doc.text(`${gb.weightG.toFixed(2)}g | ${gb.purity} ${gb.type} (x${gb.ratioUsed.toFixed(3)}) @ $${gb.purePriceAtTime.toFixed(2)}/g = $${gb.calculatedCostCad.toFixed(2)}`, MARGIN + 35, gy);
            gy += 10;
        });
    } else {
        // Details Line
        doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
        const details = `Weight: ${cost.finalWeightG.toFixed(2)}g  |  Purity Ratio: ${cost.usedRatio.toFixed(3)}  |  Pure Price: $${cost.usedPurePricePerGram.toFixed(2)}/g`;
        doc.text(details, MARGIN + 5, y + 28);
    }

    if (cost.finalWeightG <= 0) {
        doc.setTextColor(200, 0, 0);
        doc.text("⚠ Missing final gold weight — cost incomplete", PAGE_WIDTH - MARGIN - 5, y + 16, { align: "right" });
    }

    y += goldSectionHeight + 5;

    // 2. Diamond Cost Section
    doc.setDrawColor(200);
    doc.setLineWidth(0.1);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
    doc.text("Net Diamond Used", MARGIN, y);

    const totalPcs = cost.breakdown.reduce((acc, b) => acc + b.usedPcs, 0);
    const diamondDetails = `${totalPcs} pcs  /  ${cost.totalCaratsUsed.toFixed(3)} ct`;

    doc.setFont("helvetica", "normal");
    doc.text(diamondDetails, PAGE_WIDTH - MARGIN - 60, y, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.text(`$${cost.totalDiamondCostCad.toFixed(2)}`, PAGE_WIDTH - MARGIN, y, { align: "right" });
    y += 8;

    // 3. Labour Cost Section
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.text("Labour / Setter Fee", MARGIN, y);
    doc.text(`$${cost.labourCost.toFixed(2)}`, PAGE_WIDTH - MARGIN, y, { align: "right" });
    y += 12;

    // 4. Grand Total (Boxed)
    doc.setFillColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 16, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text("TOTAL PROJECT COST (CAD)", MARGIN + 5, y + 11);

    doc.setFontSize(16);
    doc.text(`$${cost.totalProjectCostCad.toFixed(2)}`, PAGE_WIDTH - MARGIN - 5, y + 11, { align: "right" });

    // --- Footer ---
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generated by KILANI Ledger • ${currentUser?.name || 'User'}`, MARGIN, pageHeight - 10);

    // Save
    const safeCode = project.code.replace(/[^a-z0-9]/gi, '_');
    const safeClient = (project.clientName || 'Client').replace(/[^a-z0-9]/gi, '_');
    const safePiece = (project.pieceName || 'Piece').replace(/[^a-z0-9]/gi, '_');

    doc.save(`${safeCode}_${safeClient}_${safePiece}_A4.pdf`);
};

/**
 * Generates an Appendix PDF of all evidence images for a project,
 * laid out in a 2-column grid with metadata captions.
 */
export const generateEvidenceAppendixPDF = async (
    project: Project,
    currentUser: User | null
) => {
    const evidenceImages = store.getEvidenceImages().filter(ev => ev.projectId === project.id)
        .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));

    if (evidenceImages.length === 0) {
        alert('No evidence images found for this project.');
        return;
    }

    const doc = new jsPDF();
    const safeCode = project.code.replace(/[^a-z0-9]/gi, '_');
    const safeClient = (project.clientName || 'Client').replace(/[^a-z0-9]/gi, '_');

    // Helper: check/add page
    const ensureSpace = (neededMm: number) => {
        if (y + neededMm > PAGE_HEIGHT - 20) {
            doc.addPage();
            y = MARGIN;
            drawAppendixHeader();
        }
    };

    const drawAppendixHeader = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
        doc.text("KILANI", MARGIN, MARGIN - 6);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
        doc.text("DIAMOND LEDGER — EVIDENCE APPENDIX", MARGIN + 22, MARGIN - 6);
        doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
        doc.setFontSize(7);
        doc.text(`Project: ${project.code}  |  Client: ${project.clientName || '—'}`, PAGE_WIDTH - MARGIN, MARGIN - 6, { align: 'right' });
        doc.setDrawColor(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
        doc.setLineWidth(0.4);
        doc.line(MARGIN, MARGIN - 3, PAGE_WIDTH - MARGIN, MARGIN - 3);
    };

    let y = MARGIN + 4;
    drawAppendixHeader();

    // Title block
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
    doc.text("Diamond Evidence Appendix", MARGIN, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
    doc.text(
        `Project: ${project.code}  •  ${project.pieceName}  •  Generated: ${new Date().toLocaleString()}  •  ${evidenceImages.length} records`,
        MARGIN, y
    );
    y += 10;
    doc.setDrawColor(C_LIGHT_GRAY[0], C_LIGHT_GRAY[1], C_LIGHT_GRAY[2]);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 8;

    // 2-column grid
    const COL_GAP = 8;
    const IMG_W = (CONTENT_WIDTH - COL_GAP) / 2;
    const IMG_H = IMG_W * 0.75; // 4:3 ratio
    const CAPTION_H = 22;
    const CELL_H = IMG_H + CAPTION_H + 6;

    let col = 0; // 0 = left, 1 = right

    for (const ev of evidenceImages) {
        ensureSpace(CELL_H);

        const x = MARGIN + col * (IMG_W + COL_GAP);

        // Image box background
        doc.setFillColor(C_LIGHT_GRAY[0], C_LIGHT_GRAY[1], C_LIGHT_GRAY[2]);
        doc.rect(x, y, IMG_W, IMG_H, 'F');

        // Embed image (uses photoUrl which is a remote URL or data URI)
        try {
            const photoUrl = ev.photoUrl;
            if (photoUrl && photoUrl.startsWith('data:')) {
                const format = photoUrl.includes('png') ? 'PNG' : 'JPEG';
                doc.addImage(photoUrl, format, x, y, IMG_W, IMG_H, undefined, 'FAST');
            } else if (photoUrl && photoUrl.startsWith('http')) {
                // For remote URLs, fetch as data URI
                const response = await fetch(photoUrl);
                const blob = await response.blob();
                const dataUri = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
                const format = dataUri.includes('png') ? 'PNG' : 'JPEG';
                doc.addImage(dataUri, format, x, y, IMG_W, IMG_H, undefined, 'FAST');
            }
        } catch (_err) {
            // Fallback: draw placeholder
            doc.setFontSize(7);
            doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
            doc.text('Image unavailable', x + IMG_W / 2, y + IMG_H / 2, { align: 'center', baseline: 'middle' });
        }

        // Type label badge overlaid top-left
        const labelText = ev.transactionType === 'ISSUE' ? 'ISSUE' : 'RETURN';
        doc.setFillColor(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
        doc.rect(x, y, 16, 5, 'F');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        doc.text(labelText, x + 1, y + 3.5);

        // Version badge overlaid top-right
        doc.setFillColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
        doc.rect(x + IMG_W - 12, y, 12, 5, 'F');
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.text(`v${ev.version}`, x + IMG_W - 11, y + 3.5);

        // Caption block
        const capY = y + IMG_H + 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(C_BLACK[0], C_BLACK[1], C_BLACK[2]);
        doc.text(`Bag #${ev.bagNumber}`, x, capY + 4);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
        doc.text(`By: ${ev.uploaderName}`, x, capY + 9);
        doc.text(new Date(ev.uploadedAt).toLocaleString(), x, capY + 14);

        const sourceLabel = ev.imageSource || '—';
        const statusLabel = ev.transactionStatus || '—';
        doc.text(`Source: ${sourceLabel}  |  Status: ${statusLabel}`, x, capY + 19);

        // Advance grid
        col++;
        if (col > 1) {
            col = 0;
            y += CELL_H + 4;
        }
    }

    // If ended on left column, advance row
    if (col === 1) {
        y += CELL_H + 4;
    }

    // Footer on every page
    const totalPages = (doc.internal as any).getNumberOfPages?.() ?? 1;
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
            `Generated by KILANI Ledger • ${currentUser?.name || 'User'} • Page ${p} of ${totalPages}`,
            MARGIN, PAGE_HEIGHT - 8
        );
    }

    doc.save(`${safeCode}_${safeClient}_Evidence_Appendix.pdf`);
};

