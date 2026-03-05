const html_to_pdf = require('html-pdf-node');
const mongoose = require('mongoose');

/**
 * Generates a PDF bill for a part request.
 * @param {Object} data - The data for the bill.
 * @param {Object} data.partRequest - The part request document.
 * @param {Object} data.shop - The tool shop details.
 * @param {Object} data.employee - The employee details.
 * @returns {Promise<Buffer>} - The generated PDF buffer.
 */
exports.generatePartRequestBill = async (data) => {
    const { partRequest, shop, employee } = data;

    const date = new Date(partRequest.createdAt).toLocaleDateString('en-GB');
    const billingNo = partRequest._id.toString().slice(-6).toUpperCase();

    const itemsHtml = partRequest.parts.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${item.partName}</td>
            <td style="text-align: right;">${item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
    `).join('');

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bill - Gigiman Services</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 40px;
                color: #333;
                background-color: #fff;
            }
            .container {
                max-width: 800px;
                margin: auto;
                border: 1px solid #eee;
                padding: 30px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo {
                width: 80px;
                height: 80px;
                margin-bottom: 10px;
            }
            .company-name {
                font-size: 28px;
                font-weight: bold;
                color: #1a3a5f;
                letter-spacing: 1px;
                margin: 0;
                text-transform: uppercase;
            }
            .divider {
                border-top: 1px dotted #ccc;
                margin: 15px 0;
            }
            .meta-info {
                display: flex;
                justify-content: space-between;
                margin-bottom: 10px;
                font-size: 14px;
            }
            .received-by {
                margin-bottom: 20px;
                font-size: 14px;
            }
            .section-title {
                background-color: #f0f4f8;
                padding: 8px 12px;
                font-weight: bold;
                color: #1a3a5f;
                margin-bottom: 10px;
                font-size: 15px;
            }
            .details-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
                font-size: 14px;
            }
            .details-table td {
                padding: 6px 0;
            }
            .details-table td:first-child {
                width: 150px;
                font-weight: 500;
            }
            .items-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
            }
            .items-table th {
                background-color: #f0f4f8;
                padding: 10px;
                text-align: left;
                font-size: 14px;
                color: #1a3a5f;
                border-bottom: 1px solid #ddd;
            }
            .items-table td {
                padding: 12px 10px;
                border-bottom: 1px solid #eee;
                font-size: 14px;
            }
            .total-row td {
                border-top: 2px solid #eee;
                font-weight: bold;
                font-size: 16px;
                padding-top: 15px;
            }
            .footer {
                text-align: center;
                margin-top: 40px;
                font-style: italic;
                color: #777;
                font-size: 14px;
            }
            .currency {
                font-family: DejaVu Sans;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <img src="https://cdn-icons-png.flaticon.com/512/1048/1048953.png" alt="Logo" class="logo">
                <h1 class="company-name">GIGIMAN SERVICES</h1>
                <div class="divider"></div>
            </div>

            <div class="meta-info">
                <span>Date: ${date}</span>
                <span>Billing No: ${billingNo}</span>
            </div>

            <div class="received-by">
                Received By: ${employee.fullname || 'N/A'}
            </div>

            <div class="section-title">Shop Details:</div>
            <table class="details-table">
                <tr>
                    <td>Shop Name:</td>
                    <td>${shop.shopName || 'N/A'}</td>
                </tr>
                <tr>
                    <td>Owner Name:</td>
                    <td>${shop.ownerName || 'N/A'}</td>
                </tr>
                <tr>
                    <td>GSTIN:</td>
                    <td>${shop.gstNo || 'N/A'}</td>
                </tr>
                <tr>
                    <td>Address:</td>
                    <td>${shop.storeLocation || 'N/A'}</td>
                </tr>
            </table>

            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 40px;">#</th>
                        <th>Item</th>
                        <th style="text-align: right;">Amount (<span class="currency">₹</span>)</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                    <tr class="total-row">
                        <td colspan="2" style="text-align: right;">Total:</td>
                        <td style="text-align: right;"><span class="currency">₹</span> ${partRequest.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                </tbody>
            </table>

            <div class="footer">
                Thank you for your purchase!
            </div>
        </div>
    </body>
    </html>
    `;

    const options = { format: 'A4' };
    const file = { content: htmlContent };

    return new Promise((resolve, reject) => {
        html_to_pdf.generatePdf(file, options).then(pdfBuffer => {
            resolve(pdfBuffer);
        }).catch(err => {
            reject(err);
        });
    });
};
