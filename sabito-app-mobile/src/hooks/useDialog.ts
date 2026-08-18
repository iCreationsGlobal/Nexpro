import { useState } from 'react';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface DialogConfig {
  title?: string;
  message?: string;
  buttons?: DialogButton[];
}

export interface DialogState {
  visible: boolean;
  title: string;
  message: string;
  buttons: DialogButton[];
}

export interface UseDialogReturn {
  dialog: DialogState;
  showDialog: (config: DialogConfig) => void;
  hideDialog: () => void;
}

export const useDialog = (): UseDialogReturn => {
  const [dialog, setDialog] = useState<DialogState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });

  const showDialog = (config: DialogConfig): void => {
    setDialog({
      visible: true,
      title: config.title || '',
      message: config.message || '',
      buttons: config.buttons || [{ text: 'OK', style: 'default' }],
    });
  };

  const hideDialog = (): void => {
    setDialog({
      visible: false,
      title: '',
      message: '',
      buttons: [],
    });
  };

  return { dialog, showDialog, hideDialog };
};

export default useDialog;





