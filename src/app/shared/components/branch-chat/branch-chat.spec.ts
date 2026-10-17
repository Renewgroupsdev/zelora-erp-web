import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { BranchChat } from './branch-chat';

describe('BranchChat', () => {
  let component: BranchChat;
  let fixture: ComponentFixture<BranchChat>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BranchChat],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BranchChat);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
