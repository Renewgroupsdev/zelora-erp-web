import Swal from 'sweetalert2';

/**
 * Approve / reject prompt with a remarks box. Resolves to `null` when cancelled, otherwise to the
 * decision + remarks. Remarks are required to reject so the requester always learns why.
 */
export async function reviewPrompt(title: string, text: string): Promise<{ approve: boolean; remarks: string } | null> {
  const result = await Swal.fire({
    title,
    text,
    input: 'textarea',
    inputPlaceholder: 'Remarks (required to reject)',
    inputAttributes: { maxlength: '255' },
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'Approve',
    denyButtonText: 'Reject',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#0f9d58',
    denyButtonColor: '#dc4c4c',
    reverseButtons: true,
    preDeny: () => {
      const remarks = (Swal.getInput()?.value ?? '').trim();
      if (!remarks) {
        Swal.showValidationMessage('Give a reason for rejecting');
        return false;
      }
      return true;
    },
  });
  if (result.isDismissed) return null;
  return { approve: result.isConfirmed, remarks: String((result.isConfirmed ? result.value : Swal.getInput()?.value) ?? '').trim() };
}
