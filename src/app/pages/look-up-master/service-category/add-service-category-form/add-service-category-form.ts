import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ApiDataService } from '../../../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../../shared/common-services/toast.service';

@Component({
  selector: 'app-add-service-category-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule],
  templateUrl: './add-service-category-form.html',
  styleUrl: './add-service-category-form.scss',
})
export class AddServiceCategoryForm implements OnInit {
  categoryForm: FormGroup;
  isSaving = false;
  parentOptions: any[] = [];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<AddServiceCategoryForm>,
    private apiDataService: ApiDataService,
    private toast: ToastService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.categoryForm = this.fb.group({
      name: [data?.name ?? '', [Validators.required, Validators.maxLength(100)]],
      parent_id: [data?.parent_id ?? ''],
      status: [data?.status ?? 1, Validators.required],
    });
  }

  ngOnInit(): void {
    this.loadParentOptions();
  }

  get isEdit(): boolean {
    return !!this.data?.id;
  }

  loadParentOptions(): void {
    this.apiDataService.GetAllPages(ApiRoutesConstants.SERVICE_CATEGORY_GET_List).subscribe({
      next: (categories: any[]) => {
        // Only top-level categories can be picked as a parent (this schema is 2 levels deep) -
        // and a category can't be its own parent, so drop it from the list when editing.
        this.parentOptions = categories.filter(
          (category: any) => !category.parent_id && category.id !== this.data?.id
        );
      },
      error: (err: any) => {
        console.error('Failed to load parent categories:', err);
      },
    });
  }

  saveCategory(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    const formValue = this.categoryForm.getRawValue();
    const payload = {
      name: formValue.name,
      parent_id: formValue.parent_id || null,
      status: Number(formValue.status),
    };

    this.isSaving = true;

    const request = this.isEdit
      ? this.apiDataService.PUT(`${ApiRoutesConstants.SERVICE_CATEGORY_ADD}/${this.data.id}`, payload)
      : this.apiDataService.POST(ApiRoutesConstants.SERVICE_CATEGORY_ADD, payload);

    request.subscribe({
      next: (response: any) => {
        this.isSaving = false;

        if (response && response.success !== false) {
          this.toast.success(this.isEdit ? 'Category updated successfully' : 'Category saved successfully');
          this.dialogRef.close(response.data ?? payload);
        } else {
          this.toast.error(response?.message || 'Failed to save category. Please try again.');
        }
      },
      error: (err: any) => {
        this.isSaving = false;
        this.toast.error(err?.error?.message || 'Failed to save category. Please try again.');
        console.error('Failed to save category:', err);
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  isInvalid(controlName: string): boolean {
    const control = this.categoryForm.get(controlName);
    return !!(control && control.invalid && (control.dirty || control.touched));
  }
}
