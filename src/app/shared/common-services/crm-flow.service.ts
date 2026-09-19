import { Injectable } from '@angular/core';

/** One logged follow-up interaction (a call, a note, a status check) against a lead. */
export interface FollowUpEntry {
  /** When this follow-up itself happened, formatted for display. */
  date: string;
  telecaller: string;
  notes: string;
  /** ISO date of the next scheduled follow-up, if one was set. */
  nextFollowUpDate?: string;
  nextFollowUpTime?: string;
}

export interface FlowLead {
  id: string;
  name: string;
  phone: string;
  gender: string;
  source: string;
  category: string;
  request: string;
  branch: string;
  telecaller: string;
  notes: string;
  followUpDate: string;
  status: 'Valid' | 'Invalid' | 'Follow-Up' | 'Appointment';
  /** Running history of every follow-up interaction logged against this lead. */
  history?: FollowUpEntry[];
}

export interface FlowAppointment extends FlowLead {
  service: string;
  date: string;
  startTime: string;
  staff: string;
  total: number;
  paymentMethod: string;
  paymentStatus: 'Paid' | 'Partial' | 'Pending';
  /** Norwood/Ludwig baldness classification key, only set for Hair-category bookings. */
  baldnessType?: string;
  /** Treatment/product package key, when a package was chosen instead of/alongside individual treatments. */
  packageKey?: string;
  /** Doctor's suggestions, separate from general telecaller/booking notes. */
  doctorNotes?: string;
  /** Clinical examination photos, captured/uploaded as data URLs. */
  beforeImages?: string[];
  afterImages?: string[];
  /** Individually selected treatment keys, when not booked via a combo/package. */
  treatmentKeys?: string[];
  comboKey?: string | null;
  subtotal?: number;
  discountAmount?: number;
}

/** In-memory workflow state shared by the Lead, Follow-Up, Appointment and Client pages. */
@Injectable({ providedIn: 'root' })
export class CrmFlowService {
  private followUps: FlowLead[] = [];
  private appointments: FlowAppointment[] = [];
  private clients: FlowAppointment[] = [];

  addFollowUp(lead: FlowLead): void {
    this.followUps = [{ ...lead, status: 'Follow-Up' }, ...this.followUps.filter(item => item.id !== lead.id)];
  }

  getFollowUps(): FlowLead[] { return [...this.followUps]; }

  removeFollowUp(id: string): void {
    this.followUps = this.followUps.filter(item => item.id !== id);
  }

  addAppointment(appointment: FlowAppointment): void {
    this.appointments = [{ ...appointment, status: 'Appointment' }, ...this.appointments.filter(item => item.id !== appointment.id)];
  }

  getAppointments(): FlowAppointment[] { return [...this.appointments]; }

  addClient(appointment: FlowAppointment): void {
    this.clients = [{ ...appointment }, ...this.clients.filter(item => item.phone !== appointment.phone)];
  }

  getClients(): FlowAppointment[] { return [...this.clients]; }
}
