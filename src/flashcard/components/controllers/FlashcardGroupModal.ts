import type { CardGroup } from "../../types/FSRSTypes";
import { t } from "../../../i18n";

export interface FlashcardGroupFormValues {
    name: string;
    filter: string;
    isReversed: boolean;
    useGlobalSettings: boolean;
    newCardsPerDay: number;
    reviewsPerDay: number;
}

export interface FlashcardGroupModal {
    saveButton: HTMLButtonElement;
    cancelButton: HTMLButtonElement;
    close(): void;
    getValues(): FlashcardGroupFormValues;
}

export function createFlashcardGroupModal(group?: CardGroup): FlashcardGroupModal {
    const modalOverlay = createEl('div');
    modalOverlay.className = 'flashcard-modal-overlay';
    activeDocument.body.appendChild(modalOverlay);

    const modalContainer = modalOverlay.createDiv({ cls: 'flashcard-modal-container' });
    const modalContent = modalContainer.createDiv({ cls: 'flashcard-modal-content' });
    const modalHeader = modalContent.createDiv({ cls: 'flashcard-modal-header' });

    modalHeader.createEl('h3', {
        text: group ? t('Edit group') : t('Create group')
    });

    const formContainer = modalContent.createDiv({ cls: 'flashcard-group-form' });
    const state = createInitialFormState(group);

    renderBasicFields(formContainer, state);
    renderLearningSettings(formContainer, state);

    const buttonContainer = modalContent.createDiv({ cls: 'button-container' });
    const cancelButton = buttonContainer.createEl('button', {
        cls: 'flashcard-cancel-btn',
        text: t('Cancel')
    });
    const saveButton = buttonContainer.createEl('button', {
        cls: 'flashcard-save-group-btn',
        text: group ? t('Save') : t('Create')
    });

    let handleKeyDown: (event: KeyboardEvent) => void;
    const close = () => {
        if (modalOverlay.isConnected) {
            activeDocument.body.removeChild(modalOverlay);
        }
        activeDocument.removeEventListener('keydown', handleKeyDown);
    };

    handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            close();
        }
    };
    activeDocument.addEventListener('keydown', handleKeyDown);

    return {
        saveButton,
        cancelButton,
        close,
        getValues: () => ({ ...state })
    };
}

function createInitialFormState(group?: CardGroup): FlashcardGroupFormValues {
    return {
        name: group ? group.name : '',
        filter: group ? group.filter : '',
        isReversed: group ? group.isReversed || false : false,
        useGlobalSettings: group ? (group.settings?.useGlobalSettings !== false) : true,
        newCardsPerDay: group ? (group.settings?.newCardsPerDay || 20) : 20,
        reviewsPerDay: group ? (group.settings?.reviewsPerDay || 100) : 100
    };
}

function renderBasicFields(container: HTMLElement, state: FlashcardGroupFormValues): void {
    const nameInput = container.createEl('input', {
        cls: 'flashcard-modal-input',
        attr: {
            type: 'text',
            placeholder: t('Enter name')
        }
    });
    nameInput.value = state.name;
    nameInput.addEventListener('input', (event) => {
        state.name = (event.target as HTMLInputElement).value;
    });

    const filterTextarea = container.createEl('textarea', {
        cls: 'flashcard-modal-input',
        attr: {
            placeholder: t('Support format: \nFolder: folder1, folder1/folder2\nNote: [[note1]], [[note2]]')
        }
    });
    filterTextarea.value = state.filter;
    filterTextarea.addEventListener('input', (event) => {
        state.filter = (event.target as HTMLTextAreaElement).value;
    });

    const reverseContainer = container.createDiv({ cls: 'flashcard-modal-option' });
    const reverseCheckbox = reverseContainer.createEl('input', {
        cls: 'flashcard-modal-checkbox',
        attr: { type: 'checkbox' }
    });
    reverseCheckbox.checked = state.isReversed;

    reverseContainer.createEl('label', {
        cls: 'flashcard-modal-label',
        text: t('Reverse cards (use comments as questions)')
    });

    reverseCheckbox.addEventListener('change', (event) => {
        state.isReversed = (event.target as HTMLInputElement).checked;
    });
}

function renderLearningSettings(container: HTMLElement, state: FlashcardGroupFormValues): void {
    const settingsContainer = container.createDiv({ cls: 'flashcard-modal-settings' });
    const settingsHeader = settingsContainer.createDiv({ cls: 'flashcard-modal-settings-header' });
    settingsHeader.createEl('h4', {
        cls: 'settings-title',
        text: t('Learning settings')
    });

    const globalSettingsContainer = settingsHeader.createDiv({
        cls: 'flashcard-modal-option use-global-option'
    });
    const globalCheckbox = globalSettingsContainer.createEl('input', {
        cls: 'flashcard-modal-checkbox',
        attr: {
            id: 'use-global-settings',
            type: 'checkbox'
        }
    });
    globalCheckbox.checked = state.useGlobalSettings;
    globalSettingsContainer.createEl('label', {
        cls: 'flashcard-modal-label',
        text: t('Use global settings'),
        attr: { for: 'use-global-settings' }
    });

    const newCardsControl = renderSliderSetting(settingsContainer, {
        label: t('New cards per day: '),
        min: 5,
        max: 100,
        step: 5,
        value: state.newCardsPerDay,
        onChange: (value) => {
            state.newCardsPerDay = value;
        }
    });

    const reviewsControl = renderSliderSetting(settingsContainer, {
        label: t('Reviews per day: '),
        min: 10,
        max: 500,
        step: 10,
        value: state.reviewsPerDay,
        onChange: (value) => {
            state.reviewsPerDay = value;
        }
    });

    const updateSettingsState = () => {
        newCardsControl.setDisabled(state.useGlobalSettings);
        reviewsControl.setDisabled(state.useGlobalSettings);
    };

    globalCheckbox.addEventListener('change', (event) => {
        state.useGlobalSettings = (event.target as HTMLInputElement).checked;
        updateSettingsState();
    });

    updateSettingsState();
}

function renderSliderSetting(
    container: HTMLElement,
    options: {
        label: string;
        min: number;
        max: number;
        step: number;
        value: number;
        onChange: (value: number) => void;
    }
): { setDisabled(disabled: boolean): void } {
    const optionContainer = container.createDiv({ cls: 'flashcard-modal-option slider-option' });
    optionContainer.createEl('label', {
        cls: 'flashcard-modal-label',
        text: options.label
    });

    const sliderContainer = optionContainer.createDiv({ cls: 'slider-with-value' });
    const slider = sliderContainer.createEl('input', {
        cls: 'flashcard-modal-slider',
        attr: {
            type: 'range',
            min: String(options.min),
            max: String(options.max),
            step: String(options.step)
        }
    });
    slider.value = String(normalizeSliderValue(options.value, options.min, options.step));

    const valueDisplay = sliderContainer.createEl('span', {
        cls: 'slider-value',
        text: slider.value
    });

    options.onChange(parseInt(slider.value));

    slider.addEventListener('input', () => {
        const value = parseInt(slider.value);
        options.onChange(value);
        valueDisplay.textContent = slider.value;
    });

    return {
        setDisabled(disabled: boolean): void {
            slider.disabled = disabled;
            optionContainer.classList.toggle('disabled', disabled);
        }
    };
}

function normalizeSliderValue(value: number, min: number, step: number): number {
    if (value < min) return min;
    if (value % step !== 0) return Math.round(value / step) * step;
    return value;
}
