// 导出预览使用的样式
export const exportStyles = `
    /* 导出卡片基础样式 */
    .highlight-export-card {
        transition: all 0.3s ease;
        padding: 20px;
        background-color: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    }

    /* 现代风格模板 */
    .highlight-export-card-modern {
        padding: 24px;
        position: relative;
        overflow: hidden;
    }

    .highlight-export-card-modern::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 4px;
        background: linear-gradient(to bottom right, #5871ef 0%, #4c63e6 100%);
    }

    .highlight-export-card-modern .highlight-export-quote-decoration {
        position: absolute;
        top: 24px;
        right: 24px;
        opacity: 0.06;
        transform: scale(2);
    }

    .highlight-export-card-modern .highlight-export-quote-section {
        position: relative;
        padding: 24px 0;
    }

    .highlight-export-card-modern .highlight-export-quote {
        font-size: 1em;
        line-height: 1.7;
        color: #333333;
        font-weight: 400;
        letter-spacing: -0.01em;
        margin: 0;
        position: relative;
        z-index: 1;
    }

    .highlight-export-card-modern .highlight-export-footer {
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid rgba(0, 0, 0, 0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .highlight-export-card-modern .highlight-export-source {
        font-size: 0.9em;
        color: #666666;
        font-weight: 500;
        display: flex;
        align-items: center;
    }

    .highlight-export-card-modern:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.15);
    }

    /* 导出预览容器 */
    .highlight-export-preview {
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        padding: 20px;
    }

    /* 导出容器 */
    .highlight-export-container {
        padding: 20px;
        margin: 0;
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        width: 480px;
    }
`;
