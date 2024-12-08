export class DragPreview {
    private static instance: HTMLElement | null = null;
    private static dragImage: HTMLImageElement;

    static {
        this.dragImage = new Image();
        this.dragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }

    public static start(e: DragEvent, text: string, options: {
        showIcon?: boolean;
        maxLength?: number;
    } = {}) {
        const {
            showIcon = true,
            maxLength = 30
        } = options;

        this.clear();

        this.instance = document.createElement('div');
        this.instance.className = 'highlight-dragging';

        // 创建内容容器
        const content = document.createElement('div');
        content.className = 'highlight-dragging-content';
        
        // 限制预览文本长度
        const previewText = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
        content.textContent = previewText;
        
        this.instance.appendChild(content);
        document.body.appendChild(this.instance);

        // 设置初始位置
        this.updatePosition(e.clientX, e.clientY);

        // 设置空的拖拽图像
        e.dataTransfer?.setDragImage(this.dragImage, 0, 0);

        // 添加移动监听
        document.addEventListener('dragover', this.handleDragOver);
    }

    private static handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        this.updatePosition(e.clientX, e.clientY);
    }

    private static updatePosition(x: number, y: number) {
        if (this.instance) {
            this.instance.style.left = `${x + 10}px`;
            this.instance.style.top = `${y + 10}px`;
        }
    }

    public static clear() {
        if (this.instance) {
            this.instance.remove();
            this.instance = null;
        }
        document.removeEventListener('dragover', this.handleDragOver);
    }
} 