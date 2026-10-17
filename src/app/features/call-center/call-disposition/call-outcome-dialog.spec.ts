import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { CallOutcomeDialog } from './call-outcome-dialog';

describe('CallOutcomeDialog', () => {
  let component: CallOutcomeDialog;
  let fixture: ComponentFixture<CallOutcomeDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CallOutcomeDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: MAT_DIALOG_DATA, useValue: { call: { direction: 'inbound', caller_number: '9000000000', destination_number: '100', talk_duration: 0 } } }, { provide: MatDialogRef, useValue: { close: () => undefined, afterClosed: () => ({ subscribe: () => undefined }) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(CallOutcomeDialog);
    component = fixture.componentInstance;
    // Rendered by its opener with real data (dialog data / inputs), so only creation is checked here.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
