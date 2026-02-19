
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
          doc.setDrawColor(200);
          doc.setFillColor(245);
          doc.rect(imgX, startY, imgWidth, imgHeight, "FD");
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text("Image Unavailable", imgX + imgWidth/2, startY + imgHeight/2, { align: "center" });
      }
  } else {
      // Draw Placeholder
      doc.setDrawColor(200);
      doc.setFillColor(245);
      doc.rect(imgX, startY, imgWidth, imgHeight, "FD");
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("No Image", imgX + imgWidth/2, startY + imgHeight/2, { align: "center" });
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

  // 1. Gold Cost Section
  doc.setFillColor(C_LIGHT_GRAY[0], C_LIGHT_GRAY[1], C_LIGHT_GRAY[2]);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 35, "F"); // Background
  
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

  // Details Line
  doc.setTextColor(C_GRAY[0], C_GRAY[1], C_GRAY[2]);
  const details = `Weight: ${cost.finalWeightG.toFixed(2)}g  |  Purity Ratio: ${cost.usedRatio.toFixed(3)}  |  Pure Price: $${cost.usedPurePricePerGram.toFixed(2)}/g`;
  doc.text(details, MARGIN + 5, y + 28);

  if (cost.finalWeightG <= 0) {
      doc.setTextColor(200, 0, 0);
      doc.text("⚠ Missing final gold weight — cost incomplete", PAGE_WIDTH - MARGIN - 5, y + 16, { align: "right" });
  }

  y += 40;

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
