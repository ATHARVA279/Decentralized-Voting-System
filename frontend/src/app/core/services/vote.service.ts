import { Injectable }     from '@angular/core';
import { HttpClient }     from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment }    from '../../../environments/environment';

export interface CastVoteDto {
  election_id:  string;
  candidate_id: string;
}

export interface VoteStatus {
  election_id: string;
  has_voted:   boolean;
}

@Injectable({ providedIn: 'root' })
export class VoteService {
  private readonly API = `${environment.voteServiceUrl}/api/votes`;

  constructor(private http: HttpClient) {}

  cast(dto: CastVoteDto): Observable<{ message: string; vote_id: string; vote_hash: string }> {
    return this.http.post<{ message: string; vote_id: string; vote_hash: string }>(
      `${this.API}/cast`, dto
    );
  }

  status(electionId: string): Observable<VoteStatus> {
    return this.http.get<VoteStatus>(`${this.API}/status/${electionId}`);
  }

  auditTrail(electionId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.API}/audit/${electionId}`);
  }
}
