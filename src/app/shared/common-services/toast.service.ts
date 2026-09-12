import { Injectable } from '@angular/core';
import Swal, { SweetAlertIcon } from 'sweetalert2';

/**
 * Thin wrapper around SweetAlert2's standard centered modal (icon, title, OK
 * button) so every part of the app shows success/error messages the same way,
 * without repeating the Swal.fire config everywhere it's needed.
 */
@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private fire(icon: SweetAlertIcon, title: string, text?: string): void {
    Swal.fire({
      icon,
      title,
      text,
      confirmButtonText: 'OK',
      confirmButtonColor: '#6C63FF',
    });
  }

  success(title: string, text?: string): void {
    this.fire('success', title, text);
  }

  error(title: string, text?: string): void {
    this.fire('error', title, text);
  }

  warning(title: string, text?: string): void {
    this.fire('warning', title, text);
  }

  info(title: string, text?: string): void {
    this.fire('info', title, text);
  }
}

