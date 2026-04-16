import { Injectable }   from '@angular/core';
import { HttpClient }   from '@angular/common/http';
import { Observable }   from 'rxjs';
import { environment }  from '../../../environments/environment';

export interface Election {
  id:               string;
  title:            string;
  description:      string | null;
  start_time:       string;
  end_time:         string;
  status:           'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled';
  created_by:       string;
  max_votes_per_user: number;
  is_public_results:  boolean;
  created_at:       string;
  updated_at:       string;
}

export interface Candidate {
  id:          string;
  election_id: string;
  name:        string;
  manifesto:   string | null;
  photo_url:   string | null;
  department:  string | null;
  position:    string | null;
  created_at:  string;
}

export interface ElectionResult {
  election_id:           string;
  election_title:        string;
  candidate_id:          string;
  candidate_name:        string;
  candidate_department:  string | null;
  vote_count:            number;
  vote_percentage:       number | null;
}

export interface CreateElectionDto {
  title:             string;
  description?:      string;
  start_time:        string;
  end_time:          string;
  max_votes_per_user?: number;
  is_public_results?:  boolean;
}

@Injectable({ providedIn: 'root' })
export class ElectionService {
  private readonly API = `${environment.electionServiceUrl}/api/elections`;

  constructor(private http: HttpClient) {}

  list(status?: string, limit = 20, offset = 0): Observable<{ data: Election[]; total: number }> {
    const params: Record<string, string | number> = { limit, offset };
    if (status) params['status'] = status;
    return this.http.get<{ data: Election[]; total: number }>(this.API, { params });
  }

  get(id: string): Observable<Election> {
    return this.http.get<Election>(`${this.API}/${id}`);
  }

  create(dto: CreateElectionDto): Observable<Election> {
    return this.http.post<Election>(this.API, dto);
  }

  update(id: string, dto: Partial<CreateElectionDto>): Observable<Election> {
    return this.http.put<Election>(`${this.API}/${id}`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/${id}`);
  }

  getCandidates(electionId: string): Observable<Candidate[]> {
    return this.http.get<Candidate[]>(`${this.API}/${electionId}/candidates`);
  }

  addCandidate(electionId: string, candidate: Partial<Candidate>): Observable<Candidate> {
    return this.http.post<Candidate>(`${this.API}/${electionId}/candidates`, candidate);
  }

  getResults(electionId: string): Observable<ElectionResult[]> {
    return this.http.get<ElectionResult[]>(`${this.API}/${electionId}/results`);
  }

  getParticipation(electionId: string): Observable<{ total_votes_cast: number }> {
    return this.http.get<{ total_votes_cast: number }>(`${this.API}/${electionId}/participation`);
  }
}
