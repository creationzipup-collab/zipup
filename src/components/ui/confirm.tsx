"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";

type ConfirmOptions = {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

/**
 * 브라우저 confirm() 대신 쓰는 확인창.
 * const [confirm, confirmDialog] = useConfirm(); … if (!(await confirm({ title }))) return; … {confirmDialog}
 */
export function useConfirm() {
  const [state, setState] = React.useState<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    [],
  );

  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  const element = (
    <Dialog open={!!state} onOpenChange={(open) => !open && close(false)}>
      {state && (
        <DialogContent size="sm" title={state.opts.title} description={state.opts.description} hideClose>
          <DialogFooter className="border-t-0 bg-transparent pt-1">
            <Button variant="ghost" onClick={() => close(false)}>
              {state.opts.cancelLabel ?? "취소"}
            </Button>
            <Button variant={state.opts.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
              {state.opts.confirmLabel ?? "확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );

  return [confirm, element] as const;
}
